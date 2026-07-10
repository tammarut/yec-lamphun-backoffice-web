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
