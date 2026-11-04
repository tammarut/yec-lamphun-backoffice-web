import { Result } from "neverthrow"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { SystemSettingDomain } from "./domain/system-setting.domain"

export interface ISystemSettingsRepository {
	getAllSettings(): Promise<Result<readonly SystemSettingDomain[], DatabaseError>>
	updateSetting(feature: string, value: unknown): Promise<Result<SystemSettingDomain, DatabaseError>>
}
