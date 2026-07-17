# Decrypt-then-mask `id_card_no` on read

The GET-member-detail response includes `id_card_no` in **masked** form (e.g. `632XXXXXX1483`). Because the `members.id_card_no` column stores AES-256-GCM ciphertext (per CONTEXT.md's **ID Card** entry), producing a masked plaintext requires the read path to **decrypt the ciphertext to its 13-digit plaintext, then apply a pure mask function** (`first 3 + six`X`+ last 4`) — the first plaintext-touching read path in the system. The plaintext lives only inside one service-method expression (decrypt → mask → discard) and is never logged.

## Why

The alternative — storing a pre-masked column at write time — would persist a second sensitive-ish column and freeze the mask format into the data layer (changing the mask would require a backfill). Decrypting on read keeps the masked form **derivable from the canonical ciphertext**, so the mask format is a code-level concern (one pure function in `members/domain/`) that can change without a migration. The plaintext-in-memory window is bounded to a single request and the value is discarded immediately after masking.

The mask function (`maskIdCard`) lives in `members/domain/` alongside `id-card.ts` so that every future read path (list, export, audit) shares one definition rather than re-implementing masking at each surface.

## Considered options

- **Decrypt-on-read, then mask (chosen).** Mask format stays in code; no schema change; reuses the already-written but currently-dead `IEncryptionService.decrypt()`. Cost: first plaintext read path; plaintext in API process memory for one expression.
- **Store a pre-masked column at write time.** No decrypt on read. Cost: a schema migration + backfill of existing rows; the mask format is frozen in the data layer and can't change without re-backfilling; a second sensitive-ish column.
- **Omit `id_card_no` from the GET response entirely.** Cleanest security-wise; violates the explicit OpenAPI spec which lists it as required.

## Consequences

- The GET service gains a dependency on `IEncryptionService` (injected), making it the first read-side consumer of the crypto seam.
- **Decrypt failure is non-fatal to the GET.** If `decrypt()` returns `err` (wrong key, corrupted ciphertext, truncated row), the service logs the `CryptoError` server-side and returns `id_card_no: null` in the response with HTTP 200 — the member was *found* and the row is otherwise intact, so a single bad column must not brick the detail view. The field's response type is therefore `string | null`, diverging from the OpenAPI schema which types it as a plain required `string`.
- Any new read path that surfaces `id_card_no` must use the same `maskIdCard` function; serving unmasked plaintext is a violation of the **Masked ID Card** term in CONTEXT.md.
