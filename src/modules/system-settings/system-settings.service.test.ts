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

	describe("isRenewalWindowOpen", () => {
		describe("Happy cases", () => {
			it("should return true when the feature row holds true", async () => {
				mockRepository.getAllSettings.mockResolvedValue(
					ok([
						{
							feature: "open_membership_renewal",
							value: true,
							description: null,
							createdAt: new Date(),
							updatedAt: new Date(),
						},
					])
				)

				const result = await service.isRenewalWindowOpen()

				expect(result.isOk()).toBe(true)
				expect(result._unsafeUnwrap()).toBe(true)
			})

			it("should return false when the feature row holds false", async () => {
				mockRepository.getAllSettings.mockResolvedValue(
					ok([
						{
							feature: "open_membership_renewal",
							value: false,
							description: null,
							createdAt: new Date(),
							updatedAt: new Date(),
						},
					])
				)

				const result = await service.isRenewalWindowOpen()

				expect(result.isOk()).toBe(true)
				expect(result._unsafeUnwrap()).toBe(false)
			})
		})

		describe("Unhappy cases", () => {
			it("should return false when the feature row is missing (fail-closed)", async () => {
				mockRepository.getAllSettings.mockResolvedValue(ok([]))

				const result = await service.isRenewalWindowOpen()

				expect(result.isOk()).toBe(true)
				expect(result._unsafeUnwrap()).toBe(false)
			})

			it("should propagate database error", async () => {
				const dbError = new DatabaseError("DB Error")
				mockRepository.getAllSettings.mockResolvedValue(err(dbError))

				const result = await service.isRenewalWindowOpen()

				expect(result.isErr()).toBe(true)
				expect(result._unsafeUnwrapErr()).toEqual(dbError)
			})
		})
	})

	describe("updateSettings", () => {
		it("should return updated settings on successful updates", async () => {
			const mockSettingAfter: SystemSettingDomain = {
				feature: "open_membership_renewal",
				value: false,
				description: "desc",
				createdAt: new Date(),
				updatedAt: new Date(),
			}

			mockRepository.updateSetting.mockResolvedValue(ok(mockSettingAfter))

			const result = await service.updateSettings({ open_membership_renewal: false })

			expect(result.isOk()).toBe(true)
			expect(result._unsafeUnwrap()).toEqual([mockSettingAfter])
			expect(mockRepository.updateSetting).toHaveBeenCalledWith("open_membership_renewal", false)
			expect(mockRepository.getAllSettings).not.toHaveBeenCalled()
		})

		it("should return empty array when no updates are provided", async () => {
			const result = await service.updateSettings({})

			expect(result.isOk()).toBe(true)
			expect(result._unsafeUnwrap()).toEqual([])
			expect(mockRepository.updateSetting).not.toHaveBeenCalled()
			expect(mockRepository.getAllSettings).not.toHaveBeenCalled()
		})

		it("should propagate database error on updateSetting call", async () => {
			const dbError = new DatabaseError("DB Error")

			mockRepository.updateSetting.mockResolvedValueOnce(err(dbError))

			const result = await service.updateSettings({ open_membership_renewal: false })

			expect(result.isErr()).toBe(true)
			expect(result._unsafeUnwrapErr()).toEqual(dbError)
			expect(mockRepository.getAllSettings).not.toHaveBeenCalled()
		})
	})
})
