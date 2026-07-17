# YEC Lamphun Backoffice

The administrative web application for YEC Lamphun. Manages members, their documents and images, system settings, and authentication for backoffice staff.

## Language

**Member File**:
An image uploaded by/for a member, categorized by its purpose. Each file has a fixed field name that determines which bucket and path prefix it is stored under.
_Avoid_: upload, attachment, asset

**Member File Field**:
One of six canonical multipart form field names accepted by `POST /api/v1/members/file/upload`: `id_card_image`, `company_certificate`, `profile_avatar`, `business_logo`, `business_product`, `payment_slip`. Each field maps to exactly one storage location.
_Avoid_: file type, document type

**Public Bucket** (`yec-lamphun-public`):
The R2 bucket holding member images meant for display: `profile_avatar`, `business_logo`, `business_product`. Stored under the `members/` prefix.
_Avoid_: public storage, images bucket

**Private Bucket** (`yec-lamphun-private`):
The R2 bucket holding sensitive member documents: `id_card_image`, `company_certificate`, `payment_slip`. Stored under the `members/` prefix. Access is server-mediated only.
_Avoid_: documents bucket, secure storage

**File Path**:
The R2 object key returned to the client for a successfully uploaded file, of the form `<bucket-prefix>/<field-or-short-prefix>_<ulid>.<ext>`. The client stores this path as a reference; it is not a public URL.
_Avoid_: file url, object url

**Presigned File URL**:
A time-limited, signed link to a private-bucket File Path, minted server-side via `@aws-sdk/s3-request-presigner`. Used to grant a browser temporary download access to sensitive Member Files (e.g. ID Card image, company certificate) without making the bucket public. Expires after a configured TTL.
_Avoid_: signed url, temporary url, download link

**Public File URL**:
A permanent, non-signed link to a public-bucket File Path, formed by concatenating a configured base URL (`R2_PUBLIC_BASE_URL`) with the object key. Used for display-ready Member Files (profile avatar, business logo, business product). Served via Cloudflare's CDN in production for edge caching.
_Avoid_: public link, cdn url, image url

**Position**:
A role a member holds in the chamber's organization (e.g. President, Secretary, General Member). Each position has a stable `code` (e.g. `PRESIDENT`), display names in Thai and English, and belongs to a hierarchy.
_Avoid_: title, rank, role

**Position Cardinality**:
Whether a position admits one active holder or many. `SINGLE` positions (President, Secretary, each VP, etc.) allow exactly one active member at a time; `MULTIPLE` positions (General Member, committee members, advisory board) allow any number.
_Avoid_: position type, slot count

**Supervisor**:
The active member currently holding the position directly above another member's position in the hierarchy. A supervisor is DERIVED at read time from the position hierarchy (`positions.parent_position_code`) — it is never stored as a column on a member. The President and General Members have no supervisor.
_Avoid_: parent, manager, parent member

**Member Document**:
A formal record attached to a member, of a fixed kind: `ID_CARD`, `COMPANY_CERTIFICATE`, or `PAYMENT_SLIP`. Stored as a file path reference plus a type tag — distinct from a **Member File**, which is the upload artifact before it is associated.
_Avoid_: attachment, file

**Member Business**:
The single business record a member is affiliated with. A member has at most one business. Its geographic location is stored as a two-element numeric array in `[longitude, latitude]` order.
_Avoid_: company, merchant

**ID Card**:
A member's Thai national ID. Never stored in plaintext: the column `id_card_no` holds AES-256-GCM ciphertext (base64 of IV+ ciphertext+ auth tag); the column `id_card_no_hash` holds an HMAC-SHA256 hex digest used as a blind index for duplicate lookup and uniqueness.
_Avoid_: citizen id, national id, id number

**Masked ID Card**:
The display form of an ID Card (e.g. `632XXXXXX1483`): the first three and last four digits of the plaintext, with the middle six replaced by `X`. Staff see this form in the backoffice; the plaintext and ciphertext are never displayed. Derived at read time by decrypting the ID Card ciphertext and applying a pure mask function.
_Avoid_: masked id number, hidden id, redacted id
