import { err, ok, ResultAsync, type Result } from "neverthrow"
import type { Sql } from "postgres"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { DatabaseClient } from "src/shared/lib/db/database-client"
import { inject, injectable } from "tsyringe"
import { searchLiveBusinesses } from "../sql/sqlc-generated/queries_sql"
import type { IBusinessSearchRepository } from "./interfaces"
import type { BusinessSearchFilter, BusinessSearchItem } from "../../use-case/search-businesses/search-businesses.types"

/**
 * sqlc-backed repository for the #68 business search read (GET
 * /api/v1/business). Wraps the generated {@link searchLiveBusinesses} query —
 * an escaped prefix-ILIKE over LIVE businesses with their live-member rollup —
 * and rethrows failures as DatabaseError. Runs OUTSIDE any transaction on the
 * repository's own connection and returns the AGENTS.md §2B Result shape,
 * same as the check queries on {@link BusinessesRepository}.
 * BIGSERIAL ids arrive as strings and are numbered at this boundary.
 */
@injectable()
export class BusinessSearchRepository implements IBusinessSearchRepository {
	constructor(@inject(DatabaseClient) private dbClient: DatabaseClient) {}

	/** Internal: the generated functions expect postgres.js's `Sql` type. */
	private get sql(): Sql {
		return this.dbClient.getRwConnection() as unknown as Sql
	}

	async searchLiveBusinesses(filter: BusinessSearchFilter): Promise<Result<readonly BusinessSearchItem[], DatabaseError>> {
		const result = await ResultAsync.fromPromise(
			searchLiveBusinesses(this.sql, {
				searchPattern: filter.search === null ? null : this.buildSearchPattern(filter.search),
				rowLimit: filter.limit,
			}),
			(error) => error as Error
		)
		if (result.isErr()) {
			return err(new DatabaseError("Failed to search businesses", result.error))
		}
		return ok(
			result.value.map((row) => ({
				id: Number(row.id),
				name: row.name,
				juristicRegistrationNo: row.juristicRegistrationNo,
				categoryName: row.categoryName,
				address: row.address,
				memberCount: row.memberCount,
				// sqlc-gen-typescript has no array type mapping: the generated Row
				// types the array_agg(...) column as `string`, but postgres.js parses
				// the text[] result to `string[] | null` at runtime (null when the
				// business has no live linked members). Cast at this boundary — the
				// read-side mirror of the write-side toPgArray cast in
				// BusinessesRepository.insertBusiness.
				ownerNames: (row.ownerNames as unknown as string[] | null) ?? [],
			}))
		)
	}

	/**
	 * Prefix-ILIKE over b.name and b.juristic_registration_no (issue #68).
	 * Prefix-anchored ('q%') is b-tree-indexable; substring ('%q%') is not.
	 *
	 * LIKE wildcards in the user input (`%`, `_`) and the escape char (`\`)
	 * itself are escaped before appending the trailing prefix `%`, so a search
	 * for a literal `%` or `_` matches itself rather than "anything" / "any one
	 * char". `ESCAPE '\'` declares the escape char to Postgres (in the SQL
	 * query). The value is still a bound parameter — this is semantic escaping
	 * (controlling wildcard meaning inside the pattern), not SQL-injection
	 * protection. Escape chain copied verbatim from
	 * MembersRepository.buildSearchFragment.
	 */
	private buildSearchPattern(search: string): string {
		const escaped = search.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
		return `${escaped}%`
	}
}
