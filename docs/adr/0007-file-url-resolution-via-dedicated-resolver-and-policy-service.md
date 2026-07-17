# File-URL resolution via a dedicated `IStorageUrlResolver` + member-side `MemberFileUrlService`

The GET-member-detail endpoint needs to turn stored object keys into URLs: presigned (time-limited, signed) links for private-bucket documents (`id_card_image`, `company_certificate`), and permanent concatenated links for public-bucket images (`profile_avatar`, business `logo`/`product`). Rather than extend the existing `IStorageClient` (which is write-only: `putObject` + `getBucketName`) or bury the logic in the route, we add a **new shared interface `IStorageUrlResolver`** in `src/modules/shared/storage/` with two methods — `presign(key)` and `publicUrl(key)` — implemented by the existing `R2StorageClient` (which now implements **both** `IStorageClient` and `IStorageUrlResolver`). A member-side `MemberFileUrlService` then injects the resolver plus the existing `FIELD_DEFINITIONS` field→bucket table and applies the policy: public-bucket field → `publicUrl`, private-bucket field → `presign`. This retires ADR-0002's open "future work" caveat (line 21) by building the server-mediated read path it anticipated.

## Why

The bucket-to-method mapping (`profile_avatar`→public/concat, `id_card_image`→private/presign) is **policy**, not wiring. Burying it in the GET service would mean duplicating it in every future reader (list, export, audit). A dedicated URL policy service keeps it in one place, and `member-file.constants.ts`'s `FIELD_DEFINITIONS` already holds half the table.

Splitting the *capability* (`IStorageUrlResolver`) from the *policy* (`MemberFileUrlService`) keeps each layer at one responsibility: the resolver knows *how* to mint a URL for a bucket; the member service knows *which* bucket each field belongs to. The interface-level split mirrors the AWS SDK's own separation of concerns (`@aws-sdk/client-s3` for objects vs `@aws-sdk/s3-request-presigner` for signing), and keeps `IStorageClient` from becoming a grab-bag of write and read-mint concerns.

## Considered options

- **New shared `IStorageUrlResolver` + member-side `MemberFileUrlService` (chosen).** SRP-clean at the interface level: write vs URL-minting are separate interfaces, separately mockable. The member service stays only about the field→bucket policy. Cost: one new interface file in `shared/storage/` plus one new DI token (`STORAGE_URL_RESOLVER`) and container registration.
- **Extend `IStorageClient`** with `getSignedUrl()` + `buildPublicUrl()` as methods on the same interface. Fewer files; but `IStorageClient` then mixes write and URL-minting on one interface, and callers that only write would depend on a surface that also mints URLs.
- **One fat member-side service** that injects `S3Client` directly and owns buckets, presigning, concatenation, and the field table. Fewest files, but violates AGENTS.md §2A (buries a generic capability in a feature module), is untestable without R2, and would need to be duplicated for the next module that needs URLs.

## Consequences

- Two new required env vars in `src/shared/config/env.ts`: `R2_PUBLIC_BASE_URL` (the public bucket's externally-reachable base — R2 S3 endpoint in DEV, a Cloudflare-proxied custom domain in PROD for edge caching) and `PRESIGNED_URL_EXPIRES_IN` (seconds, defaulting in practice to 3600 per the spec). Both required with no default, matching the existing R2 vars.
- The response contract for file fields changes from *object keys* (what the upload endpoint returns, per ADR-0002) to *URLs* for this read endpoint. This is a deliberate divergence between the write-side and read-side response shapes; clients must not assume a `_file_path`-suffixed field is a path.
- A future file-bearing module (e.g. events, sponsors) can reuse `IStorageUrlResolver` unchanged and supply only its own field→bucket table.

## Refinement: one adapter, two interfaces (post-review)

Originally a separate `R2StorageUrlResolver` class implemented `IStorageUrlResolver`. Code review flagged that this created **two `S3Client` singletons** — two TCP connection pools to the same R2 endpoint with duplicated config. The fix: **one adapter (`R2StorageClient`) implements both interfaces** over a single `S3Client`. The *interfaces* stay split (SRP at the seam, so callers depend on the narrow contract); the *adapter* is unified (it's the same external system). In the DI container, `STORAGE_URL_RESOLVER` is registered with `useToken: MEMBER_FILE_STORAGE_CLIENT` so both tokens resolve to the same singleton instance.

Two further refinements from review:

- `publicUrl` returns a plain `string` (no `Result` wrapper) — it is pure concatenation and infallible, so the `Result` type would have been a lie encoding a failure mode that can't happen. `presign` stays `Promise<Result<string, StorageError>>` because it is network-bound and can fail.
- `MemberFileUrlService.resolveMemberFileUrls` returns `Promise<Result<MemberFileUrls, StorageError>>`, and **propagates** presign failures as `err(StorageError)` (→ route maps to 500). This is distinct from `id_card_no` decrypt failure (ADR-0008), which degrades to `null` + 200. The distinction is the failure class: decrypt is *data-level* (one row's ciphertext is corrupt — per-field, degrade), while presign is *infra-level* (R2 unreachable, bad creds, clock skew — systemic, propagate). A 200-with-null-URLs would silently lie that the member has no documents when the truth is storage is down; a 500 is honest and actionable. Null paths (a field with no uploaded file) still pass through as `null` URLs — absence is not failure. The two presigns run in parallel via `ResultAsync.combine`, which short-circuits on the first err (fail-fast on an infra failure that would affect both fields anyway). This also retires a prior `_unsafeUnwrap()` call site in the service that would have thrown an unhandled exception past the `Result` boundary.

This supersedes the grilling session's open-decision #1 (which had presign failures degrading to null). The decision was revised after the scrutinize review separated the two failure classes — the original "consistent with decrypt-failure handling" rationale was a false analogy between data-level and infra-level failures.
