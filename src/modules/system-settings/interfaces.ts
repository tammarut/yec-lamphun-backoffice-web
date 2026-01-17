import { ResultAsync } from "neverthrow"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { SystemSettingDomain } from "./domain/system-setting.domain"

export interface ISystemSettingsRepository {
	getAllSettings(): Promise<ResultAsync<SystemSettingDomain[], DatabaseError>>
}
