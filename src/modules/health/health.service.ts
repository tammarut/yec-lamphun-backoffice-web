import { injectable, inject } from "tsyringe"
import { REGISTER_KEY } from "src/modules/container"
import { IHealthRepository } from "./health.repository.interface"

@injectable()
export class HealthService {
	constructor(
		@inject(REGISTER_KEY.HEALTH_REPOSITORY)
		private healthRepository: IHealthRepository,
	) {}

	async checkHealth(): Promise<{ status: string; dbTime: Date }> {
		const dbTime = await this.healthRepository.getDatabaseTime()
		return {
			status: "ok",
			dbTime,
		}
	}
}
