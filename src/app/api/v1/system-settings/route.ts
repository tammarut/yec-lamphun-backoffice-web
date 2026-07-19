import { ResultAsync } from "neverthrow"
import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "src/app/api/middleware/with-auth"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { SystemSettingDomain } from "src/modules/system-settings/domain/system-setting.domain"
import { SystemSettingsService } from "src/modules/system-settings/system-settings.service"
import { PatchSystemSettingsSchema } from "src/modules/system-settings/validators"
import { createLogger } from "src/shared/lib/logger/logger"
import { safeParse } from "valibot"
import { ResponseBodyError } from "../../shared/types"

export const dynamic = "force-dynamic"

const logger = createLogger(["system-settings", "route"])

function toSystemSettingsResponse(settings: readonly SystemSettingDomain[]): Record<string, unknown> {
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
		logger.error("system-settings fetch failed: {errorMessage} (code={code})", { code: result.error.code, errorMessage: result.error.message, cause: result.error.cause })
		return NextResponse.json({ error_message: "Internal Server Error" } satisfies ResponseBodyError, { status: 500 })
	}

	const responseBody = toSystemSettingsResponse(result.value)

	return NextResponse.json(responseBody)
}

export const PATCH = withAuth(async function PATCH(request: NextRequest): Promise<NextResponse<Record<string, unknown> | ResponseBodyError>> {
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
		logger.error("system-settings update failed: {errorMessage} (code={code})", { code: result.error.code, errorMessage: result.error.message, cause: result.error.cause })
		return NextResponse.json({ error_message: "Internal Server Error" }, { status: 500 })
	}

	const responseBody = toSystemSettingsResponse(result.value)
	return NextResponse.json(responseBody, { status: 200 })
})
