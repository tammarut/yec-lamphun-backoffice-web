# Implementation Plan — GET /api/v1/members/:id

Get a member's details by id for a detail/edit view. Decisions are locked in the
grilling session; see ADR-0007, ADR-0008, and the CONTEXT.md glossary additions
(Masked ID Card, Presigned File URL, Public File URL).

## Layering

```bash
route (GET /api/v1/members/[id])          — withAuth, inline id validation, error→status
  └─ GetMemberByIdService (use-case/query) — orchestrates decrypt+mask, URL resolution, response assembly
       ├─ IMemberRepository.getMemberDetailById(id)  — 2 queries, assembles read model, enforces invariants
       ├─ IEncryptionService.decrypt()            — ciphertext → plaintext (first read-side crypto use)
       ├─ maskIdCard() (domain pure fn)           — plaintext → "###XXXXXX####"
       └─ MemberFileUrlService                    — field→bucket policy; delegates to IStorageUrlResolver
            └─ IStorageUrlResolver (shared)       — presign() / publicUrl() via @aws-sdk/s3-request-presigner
```

This is **route → service → repository** with two thin collaborators (mask fn,
URL service). CQRS-compliant: no domain aggregate is reconstructed for the read;
the repository returns a query-specific read model.

---

## Open micro-decisions (confirm before implementing)

These are small enough that I defaulted them consistently with the grilling, but
flag if you disagree:

1. **File-URL failure policy (presign returns `err`; `publicUrl` is infallible concat).**
   **REVISED after scrutinize review.** A presign failure **propagates** as `err(StorageError)` → route maps to **500**. This is distinct from `id_card_no` decrypt failure (Q2/ii, ADR-0008), which degrades to `null` + 200. The distinction is the failure class: decrypt is *data-level* (one row's ciphertext is corrupt — per-field, degrade), while presign is *infra-level* (R2 unreachable, bad creds — systemic, propagate). A 200-with-null-URLs would silently lie that the member has no documents when the truth is storage is down; a 500 is honest and actionable. Null paths (no uploaded file) pass through as `null` URLs — absence is not failure. The two presigns run in parallel via `ResultAsync.combine` (short-circuits on first err). This supersedes the original grilling decision (which had presign degrading to null) — the "consistent with decrypt-failure handling" rationale was a false analogy between data-level and infra-level failures.
2. **Error message strings.** Use the spec's exact messages to match the contract:
   - 400 → `"id parameter must be a valid integer"`
   - 404 → `"not found this member id"` (spec wording; grammatical but terse)
3. **Spec quirk — `business.updated_at`.** Spec *example* shows `'2025-05-06'`
   (date-only) but the column is TIMESTAMPTZ and the schema declares `date-time`.
   Default: serialize as full ISO datetime (matches the schema, ignores the
   example's truncation).
4. **sqlc regeneration.** New queries go in `queries.sql` and must be regenerated
   with `sqlc generate`. If the `sqlc` CLI is unavailable in the working
   environment, hand-write the two generated functions in `queries_sql.ts`
   matching the existing positional-`.values()` pattern (ADR-0001).

---

## New dependency

- `@aws-sdk/s3-request-presigner` (add to `package.json`) — used only by
  `R2StorageUrlResolver`. The existing `@aws-sdk/client-s3` is reused for the
  S3Client; `@aws-sdk/client-s3`'s `S3Client` + the presigner's `getSignedUrl`
  mirror the AWS SDK's own split (per ADR-0007).

---

## File-by-file plan (bottom-up by dependency)

### 1. Env config — `src/shared/config/env.ts`

Add two **required, no-default** vars (Q11), alongside the existing R2 vars:

```tsc
R2_PUBLIC_BASE_URL: pipe(string(), minLength(1)),            // DEV: R2 S3 endpoint; PROD: Cloudflare custom domain
PRESIGNED_URL_EXPIRES_IN: pipe(number(), integer(), minValue(1)),  // seconds; spec default 3600
```

`t3-env` will fail fast if absent. `vitest.config.mts` already sets
`SKIP_ENV_VALIDATION=true`, so tests are unaffected. Update `.env.local` and
`.env.docker` with DEV values.

### 2. Shared URL resolver — `src/modules/shared/storage/`

New interface, mirroring `IStorageClient`'s placement (AGENTS.md §2A — generic
storage capability lives in `shared/`):

- **`storage-url-resolver.interface.ts`** —

  ```ts
  export interface IStorageUrlResolver {
   presign(key: string): Promise<Result<string, StorageError>>
   publicUrl(key: string): Result<string, StorageError> // pure concat, sync
  }
  ```

  (`publicUrl` is sync because it is pure string concatenation; `presign` is
  async because it calls the AWS SDK. Honest about the sync/async split.)

- **`r2-storage-url.resolver.ts`** — `@singleton() R2StorageUrlResolver implements IStorageUrlResolver`.
  Injects `EnvConfig` via `@inject(REGISTER_KEY.ENV_CONFIG)` (matches
  `R2StorageClient`/`AuthService` pattern — never `import { envConfig }`).
  Builds its own `S3Client` from `R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`.
  - `publicUrl(key)` → `ok(\`${env.R2_PUBLIC_BASE_URL}/${key}\`)`
  - `presign(key)` → `ResultAsync.fromPromise(getSignedUrl(client, new GetObjectCommand({ Bucket: env.R2_PRIVATE_BUCKET, Key: key }), { expiresIn: env.PRESIGNED_URL_EXPIRES_IN }), …)` → `Promise<Result<string, StorageError>>`

- **`errors.ts`** — reuse existing `StorageError`; add a `UrlResolutionError`
  variant if the existing shape doesn't cover "failed to mint URL" (check and
  extend minimally).

- **`index.ts`** — export the new interface + resolver.

### 3. Mask function — `src/modules/members/domain/`

- **`mask-id-card.ts`** — pure function:

  ```ts
  export function maskIdCard(plaintext: string): Result<string, MemberValidationError>
  ```

  Validates the input is a 13-digit string (defensive; the decrypted value
  should always be valid since `IdCard.fromPlaintext` validated at write time),
  then returns `first3 + "XXXXXX" + last4`. Returns `err` on malformed input so
  the service can route it to the null+log path (Q2/ii).

- **`mask-id-card.test.ts`** — happy cases (canonical Thai IDs), unhappy cases
  (wrong length, non-digits).

### 4. Read model types — `src/modules/members/domain/member-read-models.ts`

Add query-specific read models (DB-shaped, camelCase, `Date` objects, raw file
paths, `id_card_no` as ciphertext):

```ts
export interface MemberBusinessReadModel { /* id, name, juristicRegistrationNo, categoryId, address, location: [number, number], description, coreBusiness, website, logoFilePath, productFilePath, createdAt, updatedAt */ }
export interface MemberDetailReadModel { /* all member fields incl. positionCode, idCardNo (ciphertext), profileAvatar, business: MemberBusinessReadModel | null, idCardImagePath: string | null, companyCertificatePath: string | null */ }
```

`location` stays `[longitude, latitude]` (storage order) in the **read model**
(matching the DB column), but the **response** swaps it back to `[lat, long]` in
`toResponse` — round-trip symmetry with the create request body, which sends
`[lat, long]`. The OpenAPI spec example shows `[100.5596, 13.7207]` (long, lat),
which is inconsistent with the create contract; we follow the create contract.

### 5. Repository — sqlc queries + `MembersRepository`

- **`repository/sql/queries.sql`** — two new queries:

  ```sql
  -- name: GetMemberWithBusinessById :many
  SELECT m.id, m.registration_type, m.title_name_th, m.first_name_th, m.last_name_th,
         m.title_name_en, m.first_name_en, m.last_name_en, m.nickname, m.gender,
         m.date_of_birth, m.nationality, m.id_card_no, m.id_card_expiry_date,
         m.member_since, m.expires_at, m.profile_avatar, m.phone_no, m.email,
         m.line_id, m.shirt_size, m.position_code, m.status, m.created_at, m.updated_at,
         b.id AS business_id, b.name AS business_name, b.description AS business_description,
         b.juristic_registration_no, b.category_id, b.address, b.location,
         b.core_business, b.website, b.logo_file_path, b.product_file_path,
         b.created_at AS business_created_at, b.updated_at AS business_updated_at
  FROM members m
  LEFT JOIN member_business b ON b.member_id = m.id AND b.deleted_at IS NULL
  WHERE m.id = $1 AND m.deleted_at IS NULL;

  -- name: GetMemberDocumentsByMemberId :many
  SELECT type, file_path, created_at
  FROM member_documents
  WHERE member_id = $1 AND deleted_at IS NULL
    AND type IN ('ID_CARD','COMPANY_CERTIFICATE')
  ORDER BY type, created_at DESC;
  ```

  `:many` per ADR-0001 (single rows narrowed by hand). The LEFT JOIN's soft-delete
  filter lives in the `ON` clause so a soft-deleted business yields `business_* = NULL`.

- **Run `sqlc generate`** (or hand-write per open-decision #4) → updates
  `repository/sql/sqlc-generated/queries_sql.ts`.

- **`interfaces.ts`** — add to `IMemberRepository`:

  ```ts
  getMemberDetailById(id: number): Promise<Result<MemberDetailReadModel | null, DatabaseError>>
  ```

- **`members.repository.ts`** — implement `getMemberDetailById(id)`:
  1. `getMemberWithBusinessById` → if 0 rows → `ok(null)` (→ 404).
  2. If member row exists but `business_id IS NULL` → `err(new DatabaseError(\`Member ${id} has no live business row\`))` (→ 500, per Q6/iii-a). This case is
     impossible via the create flow (business insert is unconditional + atomic)
     so it signals out-of-band corruption.
  3. Else `getMemberDocumentsByMemberId` → apply **latest-wins** (first row per
     `type` given `ORDER BY type, created_at DESC`) → set
     `idCardImagePath` / `companyCertificatePath`.
  4. Map positional `.values()` rows → `MemberDetailReadModel` (BIGSERIAL `id` →
     `Number(...)`, dates arrive as `Date`, `location` as `number[]`). Return `ok(model)`.

### 6. Member URL policy service — `src/modules/members/member-file-url.service.ts`

- `@singleton() MemberFileUrlService`. Injects `IStorageUrlResolver`.
- Owns the field→bucket policy. Reuses `FIELD_DEFINITIONS` from
  `member-file.constants.ts`; adds the response-name → upload-field mapping
  (`logo`→`business_logo`, `product`→`business_product`).
- Method:

  ```ts
  resolveMemberFileUrls(input: MemberFilePaths): Promise<Result<MemberFileUrls, StorageError>>
  ```

  For each non-null path: look up bucket kind → `resolver.presign(path)` (private)
  or `resolver.publicUrl(path)` (public). Per open-decision #1, individual
  failures → that field `null` + log; only propagate `err` if every resolution
  fails catastrophically (default behavior — confirm).

### 7. Query service — `src/modules/members/use-case/get-member-by-id/`

(Matches the existing `use-case/create-new-member/` folder convention.)

- **`get-member-by-id.types.ts`** — `MemberDetailResponse` (snake_case, final
  wire shape per spec), `MemberBusinessResponse`. `id_card_no: string | null`
  (per ADR-0008 consequence — nullable on decrypt failure). `position: string`
  (the code, Q8). Business fields `logo`/`product` (Q10).
- **`get-member-by-id.errors.ts`** — `MemberNotFoundError extends AppError`
  (→ 404); `GetMemberByIdError = MemberNotFoundError | DatabaseError |
  StorageError | CryptoError`.
- **`get-member-by-id.service.ts`** — `@singleton() GetMemberByIdService`.
  Injects `IMemberRepository`, `IEncryptionService`, `MemberFileUrlService`.

  ```ts
  async execute(id: number): Promise<Result<MemberDetailResponse, GetMemberByIdError>>
  ```

  Flow:
  1. `repo.getMemberDetailById(id)` → `null` ⇒ `err(MemberNotFoundError)`; `DatabaseError` ⇒ propagate.
  2. Decrypt `idCardNo`: `encryption.decrypt(ciphertext)` → on `err`, log + `idCardNo = null` (Q2/ii); on `ok`, `maskIdCard(plaintext)` → on `err`, log + `null`; else masked string.
  3. `urlService.resolveMemberFileUrls({ idCardImagePath, companyCertificatePath, profileAvatarPath, logoPath, productPath })` → URLs (or nulls).
  4. Assemble `MemberDetailResponse` (snake_case): serialize dates — date-only (`YYYY-MM-DD`) for `date_of_birth` + `id_card_expiry_date`; ISO datetime for `member_since`, `expires_at`, `created_at`, `updated_at`, business timestamps. Swap `location` from DB order `[long, lat]` → wire order `[lat, long]` (round-trip symmetry with create).
- **`get-member-by-id.service.test.ts`** — happy case (full member), and unhappy: not found (→404), decrypt failure (→200 + null id_card_no), missing business (→500), URL resolution failure (→ field null). Construct the service directly with mocked deps (per AGENTS.md §5).

### 8. Route — `src/app/api/v1/members/[id]/route.ts`

- `export const dynamic = "force-dynamic"`.
- Inline `id` validation (Q9a): parse `params.id` (string) → Valibot `pipe(number(), integer(), minValue(1))` after `Number(...)`; invalid ⇒ 400 `{ error_message: "id parameter must be a valid integer" }`.
- Wrap handler in `withAuth(...)` (Q9b — overrides the spec's `security: []`; recorded in ADR-0007).
- Resolve `GetMemberByIdService` via `container.resolve(...)`.
- Map `Result` → `NextResponse`: `MemberNotFoundError` ⇒ 404 `{ error_message: "not found this member id" }`; everything else ⇒ 500 `{ error_message: "Internal Server Error" }` (satisfies `ResponseBodyError`).
- Async `params` (Next 15) handled mechanically.
- **`route.test.ts`** — mock `src/modules/container` per AGENTS.md §5; assert 400/401/404/500/200 paths.

### 9. DI registration — `src/modules/di-tokens.ts` + `src/modules/container.ts`

Add tokens (all `Symbol(...)`):

- `STORAGE_URL_RESOLVER: Symbol("IStorageUrlResolver")`
- `MEMBER_FILE_URL_SERVICE: Symbol("MEMBER_FILE_URL_SERVICE")`
- `GET_MEMBER_BY_ID_SERVICE: Symbol("GET_MEMBER_BY_ID_SERVICE")`

Register:

- `STORAGE_URL_RESOLVER` → `useClass: R2StorageUrlResolver`
- `MEMBER_FILE_URL_SERVICE` → `useClass: MemberFileUrlService`
- `GET_MEMBER_BY_ID_SERVICE` → `useClass: GetMemberByIdService`

Bind `IStorageUrlResolver` interface token under `STORAGE_URL_RESOLVER` so the
member URL service injects the interface, not the concrete adapter (matches the
`IStorageClient`/`IEncryptionService` binding style).

---

## Spec deviations (recorded, intentional)

| Spec says                                                 | We ship                             | Why                                                                                                                                                            |
|-----------------------------------------------------------|-------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `security: []` (public)                                   | `withAuth` required                 | Backoffice PII (decrypted ID card) must not be public (Q9b; ADR-0007)                                                                                          |
| `position: "สมาชิกทั่วไป"` (Thai name)                       | `position: "GENERAL_MEMBER"` (code) | Frontend maps code→Thai; avoids a `positions` JOIN (Q8)                                                                                                        |
| `business.logo_file_path` / `product_file_path` (example) | `logo` / `product` (schema)         | Value is now a URL, so `_file_path` is a misnomer; schema half wins (Q10)                                                                                      |
| `id_card_no` required `string`                            | `id_card_no: string \| null`        | Nullable on decrypt failure (ADR-0008)                                                                                                                         |
| `business` required                                       | `business: ... \| null`?            | **No** — per Q6 a found member with no business is corruption → 500, never a null business in a 200                                                            |
| `business.updated_at: '2025-05-06'` (date-only example)   | ISO datetime                        | Column is TIMESTAMPTZ; schema says `date-time` (open-decision #3)                                                                                              |
| `PAYMENT_SLIP` in same table                              | not surfaced                        | Out of scope for this endpoint (Q5)                                                                                                                            |
| `status` enum `[ACTIVE, EXPIRED, PENDING_RENEWAL]`        | adds `RESIGNED`                     | DB CHECK constraint (`members.status`) allows `RESIGNED`; shipping it verbatim is safer than dropping a valid DB value. OpenAPI should be corrected upstream.  |
| `location` required non-null (MemberBusiness schema)      | `location \| null`                  | DB column `location DOUBLE PRECISION[]` is nullable (no NOT NULL); a business with no location is a real DB state. OpenAPI "required" is wrong for the schema. |
| `position` nullable (MemberResponse schema)               | `position: string` (non-null)       | DB column `position_code` is `NOT NULL REFERENCES positions`; a member always has a position. OpenAPI "nullable" is wrong for the schema.                      |

---

## Test plan (Vitest, per AGENTS.md §5)

- `mask-id-card.test.ts` — canonical + malformed inputs.
- `get-member-by-id.service.test.ts` — service constructed directly with `vitest-mock-extended` mocks: happy path; not-found→404 err; decrypt-fail→null id (no throw); mask-fail→null id; missing business→DatabaseError; URL-fail→null field.
- `route.test.ts` — `vi.mock("src/modules/container", …)`; assert 400 (bad id), 401 (no session), 404, 500, 200 (shape).
- (Optional) `r2-storage-url.resolver.test.ts` — `publicUrl` concat correctness; `presign` mocked.

---

## Out of scope

- List endpoint, search, pagination.
- `PAYMENT_SLIP` URL resolution.
- Renewal/audit read paths (they'll reuse `maskIdCard` + `MemberFileUrlService`).
- Custom Cloudflare domain setup (ops concern; only the env var is wired).
- Write-side changes to `MemberFileService` (upload still returns object keys).

---

## Verification checklist

- [ ] `pnpm typecheck` (or project equivalent) passes — no `noUncheckedIndexedAccess` violations.
- [ ] `pnpm test` green — new + existing specs.
- [ ] `sqlc generate` produces the two new functions (or hand-written equivalents compile).
- [ ] `.env.local` / `.env.docker` updated with `R2_PUBLIC_BASE_URL` + `PRESIGNED_URL_EXPIRES_IN`; app boots.
- [ ] Manual: `GET /api/v1/members/1` (no cookie) → 401; (with cookie) → 200 with masked id, presigned private URLs, public-concat URLs; `/0` or `/abc` → 400; `/999999` → 404.
- [ ] ADR-0007, ADR-0008, CONTEXT.md committed alongside the code.
