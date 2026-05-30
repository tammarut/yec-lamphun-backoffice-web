import { errAsync, okAsync, ResultAsync } from "neverthrow"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { inject, singleton } from "tsyringe"
import { REGISTER_KEY } from "../di-tokens"
import { SystemSettingDomain } from "./domain/system-setting.domain"
import type { ISystemSettingsRepository } from "./interfaces"

@singleton()
export class SystemSettingsService {
	constructor(
		@inject(REGISTER_KEY.SYSTEM_SETTINGS_REPOSITORY)
		private repository: ISystemSettingsRepository
	) {}

	async getAllSettings(): Promise<ResultAsync<ReadonlyArray<SystemSettingDomain>, DatabaseError>> {
		return this.repository.getAllSettings()
	}

	async updateSettings(settings: Record<string, unknown>): Promise<ResultAsync<void, DatabaseError>> {
		for (const [feature, value] of Object.entries(settings)) {
			if (value === undefined) {
				continue
			}

			const result = await this.repository.updateSetting(feature, value)
			if (result.isErr()) {
				return errAsync(result.error)
			}
		}

		return okAsync()
	}
}
