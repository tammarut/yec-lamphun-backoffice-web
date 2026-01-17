import { ResultAsync } from "neverthrow"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { inject, injectable } from "tsyringe"
import { REGISTER_KEY } from "../di-tokens"
import { SystemSettingDomain } from "./domain/system-setting.domain"
import type { ISystemSettingsRepository } from "./interfaces"

@injectable()
export class SystemSettingsService {
	constructor(
		@inject(REGISTER_KEY.SYSTEM_SETTINGS_REPOSITORY)
		private repository: ISystemSettingsRepository
	) {}

	async getAllSettings(): Promise<ResultAsync<ReadonlyArray<SystemSettingDomain>, DatabaseError>> {
		return this.repository.getAllSettings()
	}
}
