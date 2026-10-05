import { err, ok, type Result } from "neverthrow"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { inject, singleton } from "tsyringe"
import type { IBusinessSearchRepository } from "../../repository/businesses/interfaces"
import type { BusinessSearchFilter, BusinessSearchItem } from "./search-businesses.types"

/**
 * Use case (query): search live businesses for the backoffice picker (#68).
 *
 * Pure delegation to {@link IBusinessSearchRepository.searchLiveBusinesses}:
 * the repo owns the escaped prefix-ILIKE query, the live-only filters, and the
 * live-member rollup (memberCount / ownerNames); there is no mapping, no
 * collaborator, and no additional error kind — DatabaseError propagates
 * unchanged for the route to map to 500.
 *
 * Returns AGENTS.md §2B `Promise<Result<readonly BusinessSearchItem[],
 * DatabaseError>>`.
 */
@singleton()
export class SearchBusinessesService {
	constructor(
		@inject(REGISTER_KEY.BUSINESS_SEARCH_REPOSITORY)
		private repository: IBusinessSearchRepository
	) {}

	async execute(filter: BusinessSearchFilter): Promise<Result<readonly BusinessSearchItem[], DatabaseError>> {
		const result = await this.repository.searchLiveBusinesses(filter)
		if (result.isErr()) {
			return err(result.error)
		}
		return ok(result.value)
	}
}
