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

## Membership Renewal

**Membership Renewal**:
A member's request to extend their membership tenure, submitted with a payment slip as proof of payment. Each renewal has an independent lifecycle (a review state machine with reviewer and `reviewed_at`) separate from the member who filed it. Unlike the 1:1 `member_business` child, a member accumulates many renewal rows over time — at most one of them live (non-deleted) in `PENDING_REVIEW` at any moment.
_Avoid_: renewal, extension, membership extension, renewal record

**Renewal Submission**:
The act of creating a Membership Renewal. There are two submission channels: the public create-renewal endpoint (any caller may submit on behalf of a member_id; the Renewal Status assigned depends on WHO submits — see **Public Submission** and **Admin Submission**), and the manual create endpoint (staff-only, always an Admin Submission — see **Manual Renewal Submission**).

**Public Submission**:
A Renewal Submission made without a valid staff session cookie. The renewal enters the review pipeline at Renewal Status `PENDING_REVIEW`, and the member's Member Status moves to `PENDING_RENEWAL`. A member may have at most one live `PENDING_REVIEW` renewal (enforced by a partial unique index).
_Avoid_: anonymous submission, member submission

**Admin Submission** (a.k.a. Admin Instant Approval):
A Renewal Submission made with a valid staff session cookie. The renewal skips the review pipeline: it is created directly at Renewal Status `APPROVED`, and the member's Member Status moves to `ACTIVE`. Because the member lands on `ACTIVE` (not `PENDING_RENEWAL`), the one-pending-renewal guard does not block a subsequent submission — so an admin may create multiple `APPROVED` renewals for the same member. This is accepted behavior; the rule is "valid staff session ⟹ bypass review," not "one approved renewal per member."
_Avoid_: instant renewal, auto-approval, staff submission

**Manual Renewal Submission**:
A Renewal Submission made by staff via `POST /api/v1/membership/renewals/manual`, which requires a valid staff session cookie (enforced by `withAuth`, unlike the public create-renewal endpoint's optional cookie). It is always an Admin Submission: the renewal is created at Renewal Status `APPROVED` and the member's Member Status moves to `ACTIVE`. Unlike a plain Admin Submission on the public endpoint, a Manual Renewal Submission ALSO advances the member's membership clock — it bumps `renewal_successful_count` by one and sets `expires_at` to the **Membership Expiry**. The public endpoint deliberately does neither (ADR-0015, ADR-0016).
_Avoid_: manual renewal, backoffice renewal, staff-created renewal

**Membership Expiry**:
The single business rule for the `members.expires_at` value: the last instant of the *next* calendar year after the reference date — `${currentYear + 1}-12-31T23:59:59.999` (e.g. a 2026 reference → `2027-12-31T23:59:59.999Z`). Implemented once as a shared pure function (`computeMembershipExpiry` in `src/modules/shared/membership/`) and applied at BOTH member creation (via `Member`) and on every Manual Renewal Submission (via `MembershipRenewal`); the two modules never import each other (AGENTS.md §1/§2A). Aligning members to a calendar-year cycle (rather than a rolling one-year-from-today term) is the accepted rule (ADR-0016). NOTE: this supersedes the earlier member-creation formula (`now + 1 calendar year, end of that day`); a member created mid-2026 now expires at the end of 2027, not ~2027-08.
_Avoid_: renewal end date, creation expiry, rolling expiry, new expiry

**Renewal Status**:
The review state machine of a single Membership Renewal: `PENDING_REVIEW` → (`APPROVED` | `REJECTED`). The status assigned at submission is `PENDING_REVIEW` for a Public Submission or `APPROVED` for an Admin Submission. Stored on `membership_renewals.status`; enforced by a database CHECK constraint.
_Avoid_: renewal state, review status

**Member Status**:
The lifecycle state of a member's membership itself: `ACTIVE`, `EXPIRED`, `PENDING_RENEWAL`, `RESIGNED`. Distinct from a single renewal's Renewal Status — it summarizes the member's overall standing. Stored on `members.status`. Filing a renewal moves it to `PENDING_RENEWAL` (Public Submission) or `ACTIVE` (Admin Submission).
_Avoid_: account status, membership state

**Renewal Cache Columns**:
Denormalized columns on `members` kept in sync with the renewal's own state to avoid a JOIN on every member read. The pair `status` (the Member Status) and `latest_renewal_status` (the Renewal Status of the member's most recent renewal) is written by every Renewal Submission atomically inside the renewal's transaction. The two further columns `expires_at` and `renewal_successful_count` are written ONLY by a Manual Renewal Submission — the public create-renewal flow deliberately leaves them untouched (ADR-0015 deferred them; ADR-0016 assigns them to the manual endpoint). The update-member PATCH never touches any of them (they are lifecycle columns, owned by the renewal flow).
_Avoid_: cached fields, denormalized status

**Expired Membership List**:
The read-ordered view of members whose Member Status is `EXPIRED`, consumed by the backoffice renewal-review table. Members whose most recent Membership Renewal was REJECTED surface first as a group, followed by all other expired members (including those who never filed any renewal); each group is ordered by member id ascending. Each row carries its `latest_renewal_status` (null when the member never filed a renewal) so rejected-renewal members are identifiable per row — but the ordering, not the field, is what places them on top.
_Avoid_: expired members table, rejected list, expired queue
