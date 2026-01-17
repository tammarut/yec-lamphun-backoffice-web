import { err, ok } from "neverthrow"
import "reflect-metadata"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { beforeEach, describe, expect, it } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"
import { SystemSettingDomain } from "./domain/system-setting.domain"
import { ISystemSettingsRepository } from "./interfaces"
import { SystemSettingsService } from "./system-settings.service"

describe("SystemSettingsService", () => {
	let service: SystemSettingsService
	let mockRepository: MockProxy<ISystemSettingsRepository>

	beforeEach(() => {
		mockRepository = mock<ISystemSettingsRepository>()
		service = new SystemSettingsService(mockRepository)
	})

	describe("getAllSettings", () => {
		it("should return settings from repository", async () => {
			const mockSettings: SystemSettingDomain[] = [
				{
					feature: "test_feature",
					value: true,
					description: "Test",
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			]

			mockRepository.getAllSettings.mockResolvedValue(ok(mockSettings))

			const result = await service.getAllSettings()

			expect(result.isOk()).toBe(true)
			expect(result._unsafeUnwrap()).toEqual(mockSettings)
			expect(mockRepository.getAllSettings).toHaveBeenCalledTimes(1)
		})

		it("should propagate database error", async () => {
			const dbError = new DatabaseError("DB Error")
			mockRepository.getAllSettings.mockResolvedValue(err(dbError))

			const result = await service.getAllSettings()

			expect(result.isErr()).toBe(true)
			expect(result._unsafeUnwrapErr()).toEqual(dbError)
		})
	})
})
