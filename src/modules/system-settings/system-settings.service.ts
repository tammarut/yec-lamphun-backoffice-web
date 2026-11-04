import { err, errAsync, ok, okAsync, Result, ResultAsync } from "neverthrow"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { inject, injectable } from "tsyringe"
import { REGISTER_KEY } from "../di-tokens"
import { SystemSettingDomain } from "./domain/system-setting.domain"
import type { ISystemSettingsRepository } from "./interfaces"

/** The feature key that gates public renewal submissions (spec #124 SEC-4). */
const RENEWAL_WINDOW_FEATURE = "open_membership_renewal"

@injectable()
export class SystemSettingsService {
	constructor(
		@inject(REGISTER_KEY.SYSTEM_SETTINGS_REPOSITORY)
		private repository: ISystemSettingsRepository
	) {}

	async getAllSettings(): Promise<ResultAsync<readonly SystemSettingDomain[], DatabaseError>> {
		return this.repository.getAllSettings()
	}

	/**
	 * SEC-4 (spec #124): whether public renewal submissions are currently
	 * accepted. A missing feature row means closed — the row is seeded, and the
	 * same assumption updateSetting already makes (it 500s on a missing row).
	 */
	async isRenewalWindowOpen(): Promise<Result<boolean, DatabaseError>> {
		const result = await this.repository.getAllSettings()
		if (result.isErr()) {
			return err(result.error)
		}

		const renewalSetting = result.value.find((setting) => setting.feature === RENEWAL_WINDOW_FEATURE)
		return ok(renewalSetting?.value === true)
	}

	async updateSettings(settings: Record<string, unknown>): Promise<ResultAsync<readonly SystemSettingDomain[], DatabaseError>> {
		const updatedSettings: SystemSettingDomain[] = []

		for (const [feature, value] of Object.entries(settings)) {
			if (value === undefined) {
				continue
			}

			const result = await this.repository.updateSetting(feature, value)
			if (result.isErr()) {
				return errAsync(result.error)
			}

			updatedSettings.push(result.value)
		}

		return okAsync(updatedSettings)
	}
}
