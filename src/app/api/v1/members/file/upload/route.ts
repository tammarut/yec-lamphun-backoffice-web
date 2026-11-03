import { ResultAsync } from "neverthrow"
import { NextRequest, NextResponse } from "next/server"
import { withOriginGate } from "src/app/api/middleware/origin-gate"
import { withPublicGuard } from "src/app/api/middleware/with-public-guard"
import { ResponseBodyError } from "src/app/api/shared/types"
import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import type { MemberFileError } from "src/modules/members/errors"
import { MemberFileValidationError } from "src/modules/members/errors"
import { MEMBER_FILE_FIELDS, type MemberFileFieldName } from "src/modules/members/member-file.constants"
import { MemberFileService } from "src/modules/members/member-file.service"
import type { MemberFileRequest, UploadedFilePathResponse } from "src/modules/members/member-file.types"
import { StorageError } from "src/modules/shared/storage"
import { createLogger } from "src/shared/lib/logger/logger"

export const dynamic = "force-dynamic"

const logger = createLogger(["members", "route", "upload"])

// SEC-2 pre-parse body cap (spec #124): 6 files x 7 MB per-file cap plus
// multipart envelope overhead, rounded up. A legal maximum upload lands well
// under this; anything above is a corrupted client or an abuse body. The
// decision is made from the Content-Length header ALONE — the body is never
// buffered when the guard trips.
const MAX_UPLOAD_BODY_BYTES = 47 * 1024 * 1024

// Public endpoint — no auth/session required (per the OpenAPI spec). SEC-2
// hardening: the Origin gate decides before the write budget, then the
// pre-parse body guard, then the existing multipart handling.
export const POST = withOriginGate(withPublicGuard("UPLOAD_WRITE", uploadMemberFiles))

async function uploadMemberFiles(request: NextRequest): Promise<NextResponse<UploadedFilePathResponse | ResponseBodyError>> {
	// 0. Pre-parse body guard (SEC-2): 413/411 decided from Content-Length
	//    before any multipart parsing buffers the body.
	const preParseRejection = preParseBodyGuard(request)
	if (preParseRejection !== null) {
		return preParseRejection
	}

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
}

/**
 * The pre-parse body guard: returns a ready-to-send 413/411 response, or null
 * when the request may proceed to multipart parsing. Real browsers and curl
 * always send Content-Length for a fully-serialized multipart body; a missing
 * header means a chunked stream, which the container would otherwise buffer
 * unbounded.
 */
function preParseBodyGuard(request: NextRequest): NextResponse<ResponseBodyError> | null {
	const contentLengthRaw = request.headers.get("content-length")
	if (contentLengthRaw === null) {
		return NextResponse.json({ error_message: "Content-Length required" } satisfies ResponseBodyError, { status: 411 })
	}
	const contentLength = Number(contentLengthRaw)
	// Negative / non-integer values are malformed (RFC 9110 §8.6) — fail-closed
	// into the same 413 branch rather than letting them reach formData()
	// (scrutiny MAJOR-1, PR #133).
	if (!Number.isFinite(contentLength) || !Number.isInteger(contentLength) || contentLength < 0 || contentLength > MAX_UPLOAD_BODY_BYTES) {
		return NextResponse.json({ error_message: "Request body too large" } satisfies ResponseBodyError, { status: 413 })
	}
	return null
}

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
	logger.error("member-file storage error: {errorMessage} (code={code})", { code: storageErr.code, errorMessage: storageErr.message, cause: storageErr.cause })

	return NextResponse.json({ error_message: "Internal Server Error" }, { status: 500 })
}
