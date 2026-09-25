import { ResultAsync } from "neverthrow"
import type { Sql } from "postgres"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { toPgArray } from "src/shared/lib/db/pg-serializers"
import { injectable } from "tsyringe"
import type { MemberDocument } from "../../domain/member-document"
import type { MemberDocumentType } from "../../domain/member-read-models"
import { insertMemberDocument, softDeleteMemberDocumentsByMemberId, softDeleteMemberDocumentsByMemberIdAndTypes } from "../sql/sqlc-generated/queries_sql"
import type { IMemberDocumentsRepository } from "./interfaces"

/**
 * sqlc-backed repository for the `member_documents` table (ADR-0024).
 *
 * Wraps the generated queries from the members module's sqlc block (one block
 * per module — the split is at the repository layer, not the sqlc layer) in
 * {@link ResultAsync.fromPromise} and rethrows as DatabaseError so the owning
 * service's transaction auto-rollbacks. All methods are tx-scoped (they take
 * the service's transaction handle — this class holds no connection of its
 * own). See {@link IMemberDocumentsRepository} for the per-method contracts.
 */
@injectable()
export class MemberDocumentsRepository implements IMemberDocumentsRepository {
	async insertDocument(sql: Sql, memberId: number, document: MemberDocument): Promise<void> {
		const result = await ResultAsync.fromPromise(
			insertMemberDocument(sql, {
				memberId: String(memberId),
				type: document.type,
				filePath: document.filePath,
			}),
			(error) => error as Error
		)
		if (result.isErr()) {
			throw new DatabaseError(result.error.message, result.error.cause)
		}
	}

	async softDeleteByMemberId(sql: Sql, memberId: number): Promise<void> {
		const result = await ResultAsync.fromPromise(softDeleteMemberDocumentsByMemberId(sql, { memberId: String(memberId) }), (error) => error as Error)
		if (result.isErr()) {
			throw new DatabaseError(result.error.message, result.error.cause)
		}
	}

	async softDeleteByTypes(sql: Sql, memberId: number, types: readonly MemberDocumentType[]): Promise<void> {
		const result = await ResultAsync.fromPromise(
			softDeleteMemberDocumentsByMemberIdAndTypes(sql, {
				memberId: String(memberId),
				// Bun.SQL serializes JS arrays via toString() → "ID_CARD,COMPANY_CERTIFICATE",
				// which Postgres rejects as a malformed array literal. Convert to the
				// Postgres array-literal form "{...}" via toPgArray. The sqlc-generated
				// arg type is string[]; the driver actually wants the literal string
				// here, hence the `as unknown as` cast.
				types: toPgArray([...types]) as unknown as string[],
			}),
			(error) => error as Error
		)
		if (result.isErr()) {
			throw new DatabaseError(result.error.message, result.error.cause)
		}
	}
}
