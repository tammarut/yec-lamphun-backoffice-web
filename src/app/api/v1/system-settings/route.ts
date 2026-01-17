import { NextResponse } from "next/server"
import { container } from "src/modules/container"
import { SystemSettingDomain } from "src/modules/system-settings/domain/system-setting.domain"
import { SystemSettingsService } from "src/modules/system-settings/system-settings.service"

function toSystemSettingsResponse(settings: ReadonlyArray<SystemSettingDomain>) {
	const response: Record<string, unknown> = {}

	for (const setting of settings) {
		response[setting.feature] = setting.value
	}

	return response
}

export async function GET() {
	const systemSettingsService = container.resolve(SystemSettingsService)
	const result = await systemSettingsService.getAllSettings()

	if (result.isErr()) {
		return NextResponse.json({ message: "Internal Server Error" }, { status: 500 })
	}

	const responseBody = toSystemSettingsResponse(result.value)

	return NextResponse.json(responseBody)
}
