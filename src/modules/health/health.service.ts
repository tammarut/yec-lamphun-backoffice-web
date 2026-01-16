import { injectable, inject } from "tsyringe"
import { ok, err, Result } from "neverthrow"
import { REGISTER_KEY } from "src/modules/di-tokens"
import type { IHealthRepository } from "./repository/health.repository.interface"
import { DatabaseError } from "src/shared/core/errors/app-error"

@injectable()
export class HealthService {
	constructor(
		@inject(REGISTER_KEY.HEALTH_REPOSITORY)
		private healthRepository: IHealthRepository,
	) {}

	async checkHealth(): Promise<
		Result<{ status: string; dbTime: Date }, DatabaseError>
	> {
		const result = await this.healthRepository.getDatabaseTime()

		if (result.isErr()) {
			return err(result.error)
		}

		return ok({
			status: "ok",
			dbTime: result.value,
		})
	}
}
