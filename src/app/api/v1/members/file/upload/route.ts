import { ResultAsync } from "neverthrow"
import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "src/app/api/middleware/with-auth"
import { ResponseBodyError } from "src/app/api/shared/types"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import type { MemberFileError } from "src/modules/members/errors"
import { MemberFileValidationError } from "src/modules/members/errors"
import { MEMBER_FILE_FIELDS, type MemberFileFieldName } from "src/modules/members/member-file.constants"
import { MemberFileService } from "src/modules/members/member-file.service"
import type { MemberFileRequest, UploadedFilePathResponse } from "src/modules/members/member-file.types"
import { StorageError } from "src/modules/shared/storage"

export const dynamic = "force-dynamic"

export const POST = withAuth(async function POST(request: NextRequest): Promise<NextResponse<UploadedFilePathResponse | ResponseBodyError>> {
	// 1. Parse multipart/form-data.
	const parseFormResult = await ResultAsync.fromPromise(request.formData(), (err) => err as Error)
	if (parseFormResult.isErr()) {
		return NextResponse.json({ error_message: "Invalid request body" }, { status: 400 })
	}
	const formData = parseFormResult.value

	// 2. Collect provided files. Only the six known field names are considered;
	//    non-File entries and absent fields are skipped.
	const memberFileRequests = convertFormDataToMemberFileInputReq(formData)

	// 3. Validate + upload via the service (fail-fast on any error).
	const memberFileService = container.resolve<MemberFileService>(REGISTER_KEY.MEMBER_FILE_SERVICE)
	const result = await memberFileService.uploadFiles(memberFileRequests)

	if (result.isErr()) {
		return mapError(result.error)
	}

	return NextResponse.json(result.value, { status: 200 })
})

function convertFormDataToMemberFileInputReq(formData: FormData): readonly MemberFileRequest[] {
	const memberFileRequests: MemberFileRequest[] = []
	for (const field of MEMBER_FILE_FIELDS) {
		const value = formData.get(field)
		if (value instanceof File) {
			memberFileRequests.push({ field: field as MemberFileFieldName, file: value })
		}
	}

	return memberFileRequests
}

function mapError(error: MemberFileError): NextResponse<ResponseBodyError> {
	if (error instanceof MemberFileValidationError) {
		return NextResponse.json({ error_message: error.message }, { status: 400 })
	}

	const storageErr = error as StorageError
	console.error(`[member-file] storage error: ${storageErr.message}`, { code: storageErr.code, cause: storageErr.cause })

	return NextResponse.json({ error_message: "Internal Server Error" }, { status: 500 })
}
