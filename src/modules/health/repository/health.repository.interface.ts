import { Result } from "neverthrow"
import { DatabaseError } from "src/shared/core/errors/app-error"

export interface IHealthRepository {
	getDatabaseTime(): Promise<Result<Date, DatabaseError>>
}
