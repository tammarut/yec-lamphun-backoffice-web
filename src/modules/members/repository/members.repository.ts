import { sql } from "bun"
import { err, ok, type Result, ResultAsync } from "neverthrow"
import type { Sql } from "postgres"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { DatabaseClient } from "src/shared/lib/db/database-client"
import { inject, injectable } from "tsyringe"
import type { Member } from "../domain/member"
import type { MemberBusiness } from "../domain/member-business"
import type { MemberDocument } from "../domain/member-document"
import type { MemberBusinessReadModel, MemberDetailReadModel, PositionCardinality, PositionReadModel } from "../domain/member-read-models"
import type { IMemberRepository } from "../interfaces"
import { InvalidCursorError } from "../use-case/get-list-members/get-list-members.errors"
import type { ListMembersFilter, MemberListPage, MemberListRow, SortField, SortOrder } from "../use-case/get-list-members/get-list-members.types"
import { countActiveHolderByPosition, countMemberByIdCardHash, getPositionByCode, insertMember, insertMemberBusiness, insertMemberDocument } from "./sql/sqlc-generated/queries_sql"
import { getMemberDocumentsByMemberId, getMemberWithBusinessById } from "./sql/sqlc-generated/queries_sql"

/**
 * sqlc-generated repository for the members module.
 *
 * Wraps each generated query in {@link ResultAsync.fromPromise} and converts to
 * the AGENTS.md §2B `Promise<Result<T, DatabaseError>>` shape. The
 * {@link create} method owns the transaction and the multi-table insert
 * (members → documents → business) as a single atomic unit; the individual
 * inserts are private helpers, invisible to the service.
 */
@injectable()
export class MembersRepository implements IMemberRepository {
	constructor(@inject(DatabaseClient) private dbClient: DatabaseClient) {}

	/** Internal: the generated functions expect postgres.js's `Sql` type. */
	private get sql(): Sql {
		return this.dbClient.getRwConnection() as unknown as Sql
	}

	async countMemberByIdCardHash(idCardNoHash: string) {
		const result = await ResultAsync.fromPromise(countMemberByIdCardHash(this.sql, { idCardNoHash }), (error) => error as Error)
		if (result.isErr()) {
			return err(new DatabaseError(result.error.message, result.error.cause))
		}
		const row = result.value[0]
		return ok(row ? row.count : 0)
	}

	async getPositionByCode(code: string) {
		const result = await ResultAsync.fromPromise(getPositionByCode(this.sql, { code }), (error) => error as Error)
		if (result.isErr()) {
			return err(new DatabaseError(result.error.message, result.error.cause))
		}
		const row = result.value[0]
		if (!row) {
			return ok(null)
		}
		return ok({
			code: row.code,
			nameTh: row.nameTh,
			nameEn: row.nameEn,
			cardinality: row.cardinality as PositionCardinality,
			parentPositionCode: row.parentPositionCode,
			displayOrder: row.displayOrder,
			isActive: row.isActive,
		} satisfies PositionReadModel)
	}

	async countActiveHolderByPosition(positionCode: string) {
		const result = await ResultAsync.fromPromise(countActiveHolderByPosition(this.sql, { positionCode }), (error) => error as Error)
		if (result.isErr()) {
			return err(new DatabaseError(result.error.message, result.error.cause))
		}
		const row = result.value[0]
		return ok(row ? row.count : 0)
	}

	async create(member: Member) {
		// The transaction is scoped to this method: insert member → documents →
		// business. bun:sql auto-commits on success, auto-rollbacks on any throw.
		try {
			const memberId = await this.dbClient.transaction(async (tx) => {
				const sql = tx as unknown as Sql
				const memberId = await this.doInsertMember(sql, member)
				if (member.documents.length > 0) {
					await this.doInsertDocuments(sql, memberId, member.documents)
				}
				await this.doInsertBusiness(sql, memberId, member.business)

				return memberId
			})

			return ok(memberId)
		} catch (error) {
			if (error instanceof DatabaseError) {
				return err(error)
			}
			return err(new DatabaseError("Member creation transaction failed", error))
		}
	}

	// --- Reads --------------------------------------------------------------

	/**
	 * Fetch a member's detail by id: member + 1:1 business (LEFT JOIN'd in one
	 * query) + latest-wins ID_CARD / COMPANY_CERTIFICATE documents (second query).
	 *
	 * Returns `null` for not-found / soft-deleted → 404. A live member whose
	 * business row is NULL (business_id IS NULL) is treated as corruption →
	 * `err(DatabaseError)` → 500 (grilling Q6/iii-a).
	 */
	async getMemberDetailById(id: number) {
		// Query 1: member + business.
		const memberResult = await ResultAsync.fromPromise(getMemberWithBusinessById(this.sql, { id: String(id) }), (error) => error as Error)
		if (memberResult.isErr()) {
			return err(new DatabaseError(memberResult.error.message, memberResult.error.cause))
		}
		const memberRow = memberResult.value[0]
		if (!memberRow) {
			// No live member row → not found / soft-deleted → 404.
			return ok(null)
		}
		if (memberRow.businessId === null) {
			// Live member with no live business row → corruption → 500.
			return err(new DatabaseError(`Member ${id} has no live business row (expected 1:1)`))
		}

		// Query 2: latest-wins documents.
		const docsResult = await ResultAsync.fromPromise(getMemberDocumentsByMemberId(this.sql, { memberId: String(id) }), (error) => error as Error)
		if (docsResult.isErr()) {
			return err(new DatabaseError(docsResult.error.message, docsResult.error.cause))
		}
		// ORDER BY type, created_at DESC → the first row of each type is the newest.
		let idCardImagePath: string | null = null
		let companyCertificatePath: string | null = null
		for (const doc of docsResult.value) {
			if (doc.type === "ID_CARD" && idCardImagePath === null) {
				idCardImagePath = doc.filePath
			} else if (doc.type === "COMPANY_CERTIFICATE" && companyCertificatePath === null) {
				companyCertificatePath = doc.filePath
			}
		}

		const business: MemberBusinessReadModel = {
			id: Number(memberRow.businessId),
			name: memberRow.businessName!,
			description: memberRow.businessDescription!,
			juristicRegistrationNo: memberRow.juristicRegistrationNo!,
			categoryId: memberRow.categoryId!,
			address: memberRow.address,
			location: memberRow.location === null ? null : ([memberRow.location[0]!, memberRow.location[1]!] as readonly [number, number]),
			coreBusiness: memberRow.coreBusiness,
			website: memberRow.website,
			logoFilePath: memberRow.logoFilePath,
			productFilePath: memberRow.productFilePath,
			createdAt: memberRow.businessCreatedAt!,
			updatedAt: memberRow.businessUpdatedAt!,
		}

		const detail: MemberDetailReadModel = {
			id: Number(memberRow.id),
			registrationType: memberRow.registrationType as MemberDetailReadModel["registrationType"],
			titleNameTh: memberRow.titleNameTh,
			firstNameTh: memberRow.firstNameTh,
			lastNameTh: memberRow.lastNameTh,
			titleNameEn: memberRow.titleNameEn,
			firstNameEn: memberRow.firstNameEn,
			lastNameEn: memberRow.lastNameEn,
			nickname: memberRow.nickname,
			gender: memberRow.gender as MemberDetailReadModel["gender"],
			dateOfBirth: memberRow.dateOfBirth,
			nationality: memberRow.nationality,
			idCardNo: memberRow.idCardNo,
			idCardExpiryDate: memberRow.idCardExpiryDate,
			memberSince: memberRow.memberSince,
			expiresAt: memberRow.expiresAt,
			profileAvatar: memberRow.profileAvatar,
			phoneNo: memberRow.phoneNo,
			email: memberRow.email,
			lineId: memberRow.lineId,
			shirtSize: memberRow.shirtSize,
			positionCode: memberRow.positionCode,
			status: memberRow.status as MemberDetailReadModel["status"],
			createdAt: memberRow.createdAt,
			updatedAt: memberRow.updatedAt,
			business,
			idCardImagePath,
			companyCertificatePath,
		}
		return ok(detail)
	}

	/**
	 * Paginated, filtered, sorted list query for GET /api/v1/members.
	 *
	 * Uses Bun SQL native — this is a dynamic read whose `WHERE`/`ORDER BY` shape
	 * varies at runtime; sqlc is the wrong tool for it (ADR-0010). The `sql`
	 * handle is the native Bun `SQL` instance from `dbClient`, cast to its real
	 * type (not the postgres.js `Sql` the sqlc call sites use).
	 *
	 * Pagination is keyset on `(sort_field, id)` with `id` as the deterministic
	 * tiebreaker (ADR-0011). Because the cursor wire format is a bare member id,
	 * building the page-N+1 predicate needs the anchor row's sort-field value,
	 * fetched here in a cheap PK lookup. A missing anchor (deleted between
	 * pages) → `err(InvalidCursorError)` → 400. `has_more`/`next_cursor` are
	 * computed via `LIMIT n+1` so the n+1 logic lives next to the SQL.
	 *
	 * Corrupted members (live member, no live business) are silently excluded
	 * via INNER JOIN — the list renders the page, the invariant-loudness lives
	 * in `getMemberDetailById` (grilling Q9).
	 */
	async getListMembers(filter: ListMembersFilter): Promise<Result<MemberListPage, DatabaseError | InvalidCursorError>> {
		const db = this.dbClient.getRwConnection()

		// 1. Anchor lookup (only when paginating past page 1).
		let anchorSortValue: string | number | null = null
		let hasAnchor = false
		if (filter.cursor !== null) {
			const anchorResult = await ResultAsync.fromPromise(
				db<{ sort_value: string | number | null }[]>`
					SELECT ${sql(filter.sortBy)} AS sort_value
					FROM members
					WHERE id = ${filter.cursor} AND deleted_at IS NULL
				`,
				(error) => error as Error
			)
			if (anchorResult.isErr()) {
				return err(new DatabaseError("Anchor lookup failed", anchorResult.error))
			}
			const anchorRow = anchorResult.value[0]
			if (anchorRow === undefined) {
				// Cursor points at a member that no longer exists (soft- or hard-deleted
				// since the client's previous page). The keyset predicate needs this
				// row's sort value; without it, continuing is impossible. → 400.
				return err(new InvalidCursorError())
			}
			anchorSortValue = anchorRow.sort_value
			hasAnchor = true
		}

		// 2. Build dynamic fragments. Values go through bound parameters; the
		//    ORDER BY column/direction come from a closed enum validated by
		//    Valibot, so we branch into one of three static `sql` fragments per
		//    sort field — no `sql.unsafe`, no identifier interpolation.
		const statusFragment = filter.statuses !== null && filter.statuses.length > 0 ? sql`AND m.status IN (${sql(filter.statuses)})` : sql``
		const searchFragment = filter.search !== null ? this.buildSearchFragment(filter.search) : sql``
		const cursorFragment = hasAnchor ? this.buildKeysetFragment(filter.sortBy, filter.sortOrder, anchorSortValue, filter.cursor ?? 0) : sql``
		const orderByFragment = this.buildOrderByFragment(filter.sortBy, filter.sortOrder)
		const fetchLimit = filter.limit + 1 // n+1 → has_more detection (ADR-0011).

		// 3. Main query.
		const mainResult = await ResultAsync.fromPromise(
			db`
				SELECT m.id, m.registration_type, m.title_name_th, m.first_name_th, m.last_name_th,
				       m.nickname, m.phone_no, m.email, m.line_id, m.position_code, m.status,
				       m.profile_avatar,
				       b.name AS business_name, b.description AS business_description
				FROM members m
				INNER JOIN member_business b ON b.member_id = m.id AND b.deleted_at IS NULL
				WHERE m.deleted_at IS NULL
					${statusFragment}
					${searchFragment}
					${cursorFragment}
				${orderByFragment}
				LIMIT ${fetchLimit}
			`,
			(error) => error as Error
		)
		if (mainResult.isErr()) {
			return err(new DatabaseError("getListMembers query failed", mainResult.error))
		}

		const rawRows = mainResult.value as unknown as ReadonlyArray<Record<string, unknown>>
		const hasMore = rawRows.length > filter.limit
		const pageRows = hasMore ? rawRows.slice(0, filter.limit) : rawRows
		const lastRow = pageRows[pageRows.length - 1]
		const nextCursor = hasMore && lastRow !== undefined ? Number(lastRow["id"]) : null

		return ok({ rows: pageRows.map(rowToMemberListRow), hasMore, nextCursor })
	}

	/**
	 * Prefix-ILIKE across first_name_th, phone_no, position_code (grilling Q5).
	 * Prefix-anchored ('q%') is b-tree-indexable; substring ('%q%') is not.
	 * `position` is searched as the stored code (no positions JOIN, Q4).
	 *
	 * LIKE wildcards in the user input (`%`, `_`) and the escape char (`\`)
	 * itself are escaped before appending the trailing prefix `%`, so a search
	 * for a literal `%` or `_` matches itself rather than "anything" / "any one
	 * char". `ESCAPE '\'` declares the escape char to Postgres. The value is
	 * still a bound parameter — this is semantic escaping (controlling wildcard
	 * meaning inside the pattern), not SQL-injection protection.
	 */
	private buildSearchFragment(search: string) {
		const escaped = search.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
		const pattern = `${escaped}%`
		return sql`AND (m.first_name_th ILIKE ${pattern} ESCAPE '\\'
		               OR m.phone_no ILIKE ${pattern} ESCAPE '\\'
		               OR m.position_code ILIKE ${pattern} ESCAPE '\\')`
	}

	/**
	 * Keyset predicate on `(sort_field, id)`, same direction as the sort
	 * (ADR-0011). Postgres row-value comparison `(a, b) < (x, y)` is the
	 * total-order form: combined with `id` as the final tiebreaker, there are
	 * no ties, so pages never overlap or skip rows. NULLS handling on the
	 * nullable `expires_at` is encoded in `buildOrderByFragment`; the row-value
	 * predicate's standard NULL semantics are consistent with it because every
	 * anchor row has a concrete (possibly-NULL) value that sorts to one end.
	 *
	 * The operator (`<` for DESC, `>` for ASC) is chosen by branching into one
	 * of two complete static fragments — never a standalone `sql\`<\`` keyword
	 * fragment, whose handling by Bun SQL is undocumented. Each branch is a
	 * fully-formed literal SQL fragment with only values as bound parameters.
	 */
	private buildKeysetFragment(sortBy: SortField, sortOrder: SortOrder, anchorSortValue: string | number | null, cursorId: number) {
		const column = columnFragment(sortBy)
		if (sortOrder === "desc") {
			return sql`AND (${column}, m.id) < (${anchorSortValue}, ${cursorId})`
		}
		return sql`AND (${column}, m.id) > (${anchorSortValue}, ${cursorId})`
	}

	/**
	 * `ORDER BY <column> <dir> <NULLS>, m.id <dir>`. The column and direction
	 * are emitted as one static fragment per `(sortBy, sortOrder)` combination,
	 * branched from the Valibot-validated enum — never interpolated from user
	 * text. NULLS LAST for DESC, NULLS FIRST for ASC so nullable `expires_at`
	 * rows cluster deterministically at one end of every page sequence.
	 *
	 * Like `buildKeysetFragment`, each `(sortBy, sortOrder)` pair branches into
	 * a complete static fragment rather than composing standalone keyword
	 * fragments (`sql\`DESC\``, `sql\`NULLS LAST\``).
	 */
	private buildOrderByFragment(sortBy: SortField, sortOrder: SortOrder) {
		// m.id uses the same direction as the sort column — total order, no ties.
		if (sortOrder === "desc") {
			switch (sortBy) {
				case "created_at":
					return sql`ORDER BY m.created_at DESC NULLS LAST, m.id DESC`
				case "first_name_th":
					return sql`ORDER BY m.first_name_th DESC NULLS LAST, m.id DESC`
				case "expires_at":
					return sql`ORDER BY m.expires_at DESC NULLS LAST, m.id DESC`
			}
		}
		switch (sortBy) {
			case "created_at":
				return sql`ORDER BY m.created_at ASC NULLS FIRST, m.id ASC`
			case "first_name_th":
				return sql`ORDER BY m.first_name_th ASC NULLS FIRST, m.id ASC`
			case "expires_at":
				return sql`ORDER BY m.expires_at ASC NULLS FIRST, m.id ASC`
		}
	}

	// --- Private insert helpers (run inside create's transaction) ----------

	/** Insert the member row, return the generated id as a number. */
	private async doInsertMember(sql: Sql, member: Member): Promise<number> {
		const result = await ResultAsync.fromPromise(
			insertMember(sql, {
				registrationType: member.registrationType,
				titleNameTh: member.titleNameTh,
				firstNameTh: member.firstNameTh,
				lastNameTh: member.lastNameTh,
				titleNameEn: member.titleNameEn,
				firstNameEn: member.firstNameEn,
				lastNameEn: member.lastNameEn,
				nickname: member.nickname,
				gender: member.gender,
				// Bun.SQL serializes Date via toString() → "GMT+0700" which Postgres
				// rejects; toISOString() → UTC ISO 8601 which Postgres accepts.
				// Cast through unknown because the sqlc-generated type expects Date,
				// but the driver actually wants a string here.
				dateOfBirth: toPgDate(member.dateOfBirth) as unknown as Date,
				nationality: member.nationality,
				idCardNo: member.idCardNo,
				idCardNoHash: member.idCardNoHash,
				idCardExpiryDate: toPgDate(member.idCardExpiryDate) as unknown as Date,
				memberSince: toPgDate(member.memberSince) as unknown as Date,
				expiresAt: toPgDate(member.expiresAt) as unknown as Date,
				profileAvatar: member.profileAvatar,
				phoneNo: member.phoneNo,
				email: member.email,
				lineId: member.lineId,
				shirtSize: member.shirtSize,
				positionCode: member.positionCode,
				status: member.status,
			}),
			(error) => error as Error
		)
		if (result.isErr()) {
			throw new DatabaseError(result.error.message, result.error.cause)
		}
		const row = result.value[0]
		if (!row) {
			throw new DatabaseError("insertMember returned no row")
		}
		// postgres.js returns BIGSERIAL as a string; convert at this boundary.
		return Number(row.id)
	}

	/** Insert one row per document value object. */
	private async doInsertDocuments(sql: Sql, memberId: number, documents: readonly MemberDocument[]): Promise<void> {
		for (const doc of documents) {
			const result = await ResultAsync.fromPromise(
				insertMemberDocument(sql, {
					memberId: String(memberId),
					type: doc.type,
					filePath: doc.filePath,
				}),
				(error) => error as Error
			)
			if (result.isErr()) {
				throw new DatabaseError(result.error.message, result.error.cause)
			}
		}
	}

	/** Insert the business record from its value object. */
	private async doInsertBusiness(sql: Sql, memberId: number, business: MemberBusiness): Promise<void> {
		const result = await ResultAsync.fromPromise(
			insertMemberBusiness(sql, {
				memberId: String(memberId),
				name: business.name,
				description: business.description,
				juristicRegistrationNo: business.juristicRegistrationNo,
				categoryId: business.categoryId,
				address: business.address,
				// Bun.SQL serializes JS arrays via toString() → "100.5,13.7" which
				// Postgres rejects as a malformed array literal. Convert to the
				// Postgres array literal format "{100.5,13.7}".
				location: toPgArray(business.location) as unknown as number[] | null,
				coreBusiness: business.coreBusiness,
				website: business.website,
				logoFilePath: business.logoFilePath,
				productFilePath: business.productFilePath,
			}),
			(error) => error as Error
		)
		if (result.isErr()) {
			throw new DatabaseError(result.error.message, result.error.cause)
		}
	}
}

/**
 * Convert a JS Date to a Postgres-safe ISO 8601 string.
 *
 * Bun.SQL serializes Date objects via Date.toString(), which produces a local-
 * timezone string like "2026-01-15 10:00:00 GMT+0700". Postgres does not
 * recognize the "GMT+0700" format and rejects it. Converting to ISO 8601
 * (UTC, "Z" suffix) makes Postgres accept it for both DATE and TIMESTAMPTZ
 * columns. Null passes through for nullable date columns.
 */
function toPgDate(date: Date | null): string | null {
	if (date === null) {
		return null
	}

	return date.toISOString()
}

/**
 * Convert a JS number array to a Postgres array literal string.
 *
 * Bun.SQL serializes JS arrays via Array.toString() → "100.5,13.7", which
 * Postgres rejects as a malformed array literal. The correct format is the
 * Postgres array literal "{100.5,13.7}". Null passes through for nullable
 * array columns.
 */
function toPgArray(arr: readonly number[] | null): string | null {
	if (arr === null) {
		return null
	}

	return `{${arr.join(",")}}`
}

/**
 * Map a validated {@link SortField} enum value to a static column-reference
 * `sql` fragment. The switch (not `sql.unsafe`) guarantees no user text reaches
 * the query as an identifier — only the three enum literals can land here, and
 * each is a hardcoded column reference. This is the ADR-0010 identifier-safety
 * rule applied to dynamic `ORDER BY`.
 */
function columnFragment(sortBy: SortField) {
	switch (sortBy) {
		case "created_at":
			return sql`m.created_at`
		case "first_name_th":
			return sql`m.first_name_th`
		case "expires_at":
			return sql`m.expires_at`
	}
}

/**
 * Map a raw snake_case DB row (untyped from Bun SQL) to the camelCase
 * {@link MemberListRow} the service consumes. Casts through `Record<string,
 * unknown>` because Bun SQL's template returns `any[]` under `@types/bun`;
 * the explicit index-access + `as` on each field is the typed boundary that
 * restores type safety (ADR-0010 consequence #1).
 */
function rowToMemberListRow(row: Record<string, unknown>): MemberListRow {
	return {
		id: Number(row["id"]),
		registrationType: row["registration_type"] as "INDIVIDUAL" | "JURISTIC_PERSON",
		titleNameTh: row["title_name_th"] as string,
		firstNameTh: row["first_name_th"] as string,
		lastNameTh: row["last_name_th"] as string,
		nickname: row["nickname"] as string,
		phoneNo: row["phone_no"] as string,
		email: (row["email"] as string | null) ?? null,
		lineId: (row["line_id"] as string | null) ?? null,
		positionCode: row["position_code"] as string,
		status: row["status"] as MemberListRow["status"],
		profileAvatar: (row["profile_avatar"] as string | null) ?? null,
		businessName: row["business_name"] as string,
		businessDescription: row["business_description"] as string,
	}
}
