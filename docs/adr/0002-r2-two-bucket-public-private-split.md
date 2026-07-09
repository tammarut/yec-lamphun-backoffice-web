# Member files split across two R2 buckets: public and private

Member files uploaded via `POST /api/v1/members/file/upload` are stored across **two** Cloudflare R2 buckets rather than one: `yec-lamphun-public` (display images: `profile_avatar`, `business_logo`, `business_product`) and `yec-lamphun-private` (sensitive documents: `id_card_image`, `company_certificate`, `payment_slip`). Both buckets use the `members/` key prefix.

## Why

The six member file fields fall into two categories with opposite access requirements. Avatars, logos, and product images are meant to be rendered in the backoffice UI and must be readable by browsers. ID cards, company registration certificates, and payment slips are personally identifiable / financially sensitive and must never be publicly readable.

R2 buckets are the unit of access policy: a bucket can be exposed via a public custom domain or an R2 public-development URL, and that exposure applies to every object in it. Putting sensitive documents in the same bucket as display images would force the whole bucket private and require a server-mediated read path for avatars too, or — worse — risk a misconfiguration exposing documents. Splitting lets the public bucket be safely exposed for direct browser reads while the private bucket stays locked down, with access mediated solely by the server.

## Considered options

- **Two buckets by sensitivity (chosen).** Public bucket exposable for direct browser access; private bucket server-mediated only. Clear security boundary at the bucket level. Cost: two buckets and an R2 API token whose S3 credentials must be scoped to both.
- **Single bucket with path prefixes.** Matches the OpenAPI spec's single-namespace examples literally. Rejected: R2 access policy is per-bucket, not per-prefix, so a single bucket forces one access policy for all member files — either everything public (unsafe) or everything private (breaks direct avatar reads).
- **Three buckets** (one per prefix group: documents, avatars, business). Rejected: the public/private split is the security-relevant boundary; splitting `profile_avatars` from `business/` adds buckets without adding any access-policy distinction.

## Consequences

- The storage client must target two buckets. Object key construction maps each field to `(bucket, key)` per a fixed table; the service layer carries both the bucket name and the key.
- The R2 API token used by the app must have read+write permission on **both** buckets. If a narrower token is later desired, two tokens (one per bucket) would be needed — the env schema should make the credential single, not assume per-bucket keys.
- Returning only the object key (not a public URL) in the API response keeps the contract identical for both buckets; the client does not learn from the path whether a file is public or private. A future "read file" endpoint for private bucket objects must be server-mediated (presigned URL or proxy), distinct from any public bucket URL scheme.
- Spec drift: the OpenAPI spec's response examples show single-namespace paths like `members/documents/...` with no bucket qualifier. The implemented response returns object keys in the same shape; the bucket is an internal concern not exposed in the API contract.
