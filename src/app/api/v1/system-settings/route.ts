import { ResultAsync } from "neverthrow"
import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "src/app/api/middleware/with-auth"
import { ResponseBodyError } from "src/app/api/shared/types"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { SystemSettingDomain } from "src/modules/system-settings/domain/system-setting.domain"
import { SystemSettingsService } from "src/modules/system-settings/system-settings.service"
import { PatchSystemSettingsSchema } from "src/modules/system-settings/validators"
import { safeParse } from "valibot"

export const dynamic = "force-dynamic"

function toSystemSettingsResponse(settings: readonly SystemSettingDomain[]) {
	const response: Record<string, unknown> = {}

	for (const setting of settings) {
		response[setting.feature] = setting.value
	}

	return response
}

export async function GET() {
	const systemSettingsService = container.resolve<SystemSettingsService>(REGISTER_KEY.SYSTEM_SETTINGS_SERVICE)
	const result = await systemSettingsService.getAllSettings()

	if (result.isErr()) {
		return NextResponse.json({ message: "Internal Server Error" }, { status: 500 })
	}

	const responseBody = toSystemSettingsResponse(result.value)

	return NextResponse.json(responseBody)
}

export const PATCH = withAuth(async function PATCH(request: NextRequest): Promise<NextResponse<null | ResponseBodyError>> {
	const parseReqBodyResult = await ResultAsync.fromPromise(request.json(), (err) => err as Error)
	if (parseReqBodyResult.isErr()) {
		return NextResponse.json({ error_message: "Invalid request body" }, { status: 400 })
	}

	const reqBody = parseReqBodyResult.value
	const validateReqBodyResult = safeParse(PatchSystemSettingsSchema, reqBody)

	if (!validateReqBodyResult.success) {
		const issue = validateReqBodyResult.issues[0]
		const errorMessage = issue?.message || "Validation failed"
		return NextResponse.json({ error_message: errorMessage }, { status: 400 })
	}

	const systemSettingsService = container.resolve<SystemSettingsService>(REGISTER_KEY.SYSTEM_SETTINGS_SERVICE)
	const result = await systemSettingsService.updateSettings(validateReqBodyResult.output)

	if (result.isErr()) {
		console.error("Failed to update system settings:", result.error)
		return NextResponse.json({ error_message: "Internal Server Error" }, { status: 500 })
	}

	return new NextResponse<null>(null, { status: 204 })
})
