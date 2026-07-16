/**
 * Decide whether assigning a position should conflict with an existing holder.
 *
 * Implements ADR-0006: only SINGLE cardinality positions conflict; MULTIPLE
 * positions (General Member, committee members, advisory board) never do,
 * regardless of how many members already hold them. This is a deliberate
 * deviation from the OpenAPI spec's literal step 7 ("if input position already
 * exists → 409"), which would make adding a second General Member impossible.
 *
 * Pure: takes the position's cardinality and whether an active holder already
 * exists, returns whether the assignment conflicts. The service is responsible
 * for fetching those two facts from the repository.
 */
export function shouldPositionConflict(cardinality: "SINGLE" | "MULTIPLE", activeHolderExists: boolean): boolean {
	if (cardinality === "SINGLE" && activeHolderExists) {
		return true
	}

	return false
}
