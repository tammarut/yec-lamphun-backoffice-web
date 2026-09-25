import type { Sql } from "postgres"
import type { MemberDocument } from "../../domain/member-document"
import type { MemberDocumentType } from "../../domain/member-read-models"

/**
 * Repository contract for the `member_documents` table (ADR-0024): its
 * write-side mutations, split out of IMemberRepository. The latest-wins
 * documents READ stays inside MembersRepository.getMemberDetailById — it is
 * part of the member-centric detail projection (ADR-0024 keeps read JOINs in
 * the member repository).
 *
 * Every method is a TRANSACTION-SCOPED step: it takes the calling service's
 * `tx` handle and THROWS DatabaseError on failure, so the service's
 * `DatabaseClient.transaction` auto-rollbacks (services own transactions,
 * repositories execute SQL — ADR-0023/0024).
 */
export interface IMemberDocumentsRepository {
	/**
	 * Insert one document row for a member. Called once per provided document
	 * inside the create transaction, and per replacement row inside the update
	 * transaction's soft-delete-then-insert step (grilling Q6).
	 */
	insertDocument(tx: Sql, memberId: number, document: MemberDocument): Promise<void>

	/**
	 * Soft-delete (set deleted_at) ALL of the member's live document rows —
	 * step 2 of the delete cascade. Idempotent (`deleted_at IS NULL` guard):
	 * an already-deleted member is a 0-row no-op.
	 */
	softDeleteByMemberId(tx: Sql, memberId: number): Promise<void>

	/**
	 * Soft-delete the member's live document rows of the given type(s), in
	 * preparation for inserting replacement rows. Used when a PATCH provides a
	 * non-null id_card_image and/or company_certificate. The service only calls
	 * this with a non-empty types list — the closed set is
	 * {'ID_CARD', 'COMPANY_CERTIFICATE'}.
	 */
	softDeleteByTypes(tx: Sql, memberId: number, types: readonly MemberDocumentType[]): Promise<void>
}
