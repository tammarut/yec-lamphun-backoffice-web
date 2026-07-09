import { Result, ResultAsync, err, ok } from "neverthrow"
import { inject, singleton } from "tsyringe"

import type { IIdGenerator } from "src/modules/shared/id-generator"
import type { IStorageClient } from "src/modules/shared/storage"
import { StorageError } from "src/modules/shared/storage"
import { REGISTER_KEY } from "../di-tokens"
import type { MemberFileError } from "./errors"
import { MemberFileValidationError } from "./errors"
import {
	ALLOWED_EXTENSIONS,
	EXTENSION_CONTENT_TYPE,
	FIELD_DEFINITIONS,
	MAX_FILE_SIZE_BYTES,
	MEMBER_FILE_FIELDS,
	type AllowedExtension,
	type MemberFileFieldName,
} from "./member-file.constants"
import type { MemberFileRequest, UploadedFilePathResponse } from "./member-file.types"

type UploadedObjectKeyMap = Partial<Record<MemberFileFieldName, string>>

/**
 * Owns the member-file upload workflow: fail-fast validation, then fail-fast
 * R2 upload in field order, then assembly of the response paths.
 *
 * On the first R2 upload failure, the service aborts and returns a
 * MemberFileStorageError WITHOUT cleaning up already-uploaded objects
 * (per the spec's literal pseudocode). Orphaned object keys are logged.
 */
@singleton()
export class MemberFileService {
	private readonly idGenerator: IIdGenerator
	private readonly storageClient: IStorageClient

	constructor(@inject(REGISTER_KEY.ID_GENERATOR) idGenerator: IIdGenerator, @inject(REGISTER_KEY.MEMBER_FILE_STORAGE_CLIENT) storageClient: IStorageClient) {
		this.idGenerator = idGenerator
		this.storageClient = storageClient
	}

	/**
	 * Validate and upload the given files. `inputs` must be non-empty.
	 * Returns the assembled {@link UploadedFilePathResponse} on success.
	 */
	async uploadFiles(memberFileRequests: readonly MemberFileRequest[]): Promise<Result<UploadedFilePathResponse, MemberFileError>> {
		if (memberFileRequests.length === 0) {
			return err(new MemberFileValidationError("At least one file must be provided."))
		}

		// 1. Fail-fast validation: reject the entire request if ANY file is invalid.
		const validationResult = this.validateFileRequests(memberFileRequests)
		if (validationResult.isErr()) {
			return err(validationResult.error)
		}

		// 2. Upload each file in field order. Fail-fast on the first R2 error; no cleanup.
		const uploadedObjectKeys: UploadedObjectKeyMap = {}
		for (const { field, file } of memberFileRequests) {
			const fieldDef = FIELD_DEFINITIONS[field]
			const ext = extractExtension(file.name) as AllowedExtension
			const ulid = this.idGenerator.generate()
			const filePath = `${fieldDef.keyPrefix}${fieldDef.filePrefix}_${ulid}${ext}`

			const bodyResult = await ResultAsync.fromPromise(file.arrayBuffer(), (e) => e as Error)
			if (bodyResult.isErr()) {
				return err(this.storageError(`Failed to read file buffer for "${field}"`, bodyResult.error))
			}

			const bucketName = this.storageClient.getBucketName(fieldDef.bucket)
			const putResult = await this.storageClient.putObject({
				bucket: bucketName,
				key: filePath,
				body: Buffer.from(bodyResult.value),
				contentType: EXTENSION_CONTENT_TYPE[ext],
			})
			if (putResult.isErr()) {
				// Log orphaned uploads so they can be traced. No cleanup, per spec.
				const orphans = Object.entries(uploadedObjectKeys).map(([f, k]) => `${f}=${k}`)
				console.error(
					`[member-file] upload aborted after failure on "${field}": ${putResult.error.message}` + (orphans.length ? ` | orphaned uploads: ${orphans.join(", ")}` : ""),
					{ cause: putResult.error.cause }
				)
				return err(putResult.error)
			}

			uploadedObjectKeys[field] = filePath
		}

		// 3. build response: all six keys present, null where not uploaded.
		const response = this.buildResponse(uploadedObjectKeys)
		return ok(response)
	}

	private validateFileRequests(requests: readonly MemberFileRequest[]): Result<void, MemberFileValidationError> {
		for (const { field, file } of requests) {
			const ext = extractExtension(file.name)
			const extResult = this.validateExtension(field, ext)
			if (extResult.isErr()) {
				return err(extResult.error)
			}

			const sizeResult = this.validateSize(field, file.size)
			if (sizeResult.isErr()) {
				return err(sizeResult.error)
			}
		}

		return ok(undefined)
	}

	private validateExtension(field: MemberFileFieldName, ext: string): Result<void, MemberFileValidationError> {
		if (!isAllowedExtension(ext)) {
			return err(new MemberFileValidationError(`Invalid file type for '${field}'. Only ${ALLOWED_EXTENSIONS.join(", ")} are allowed.`))
		}

		return ok(undefined)
	}

	private validateSize(field: MemberFileFieldName, size: number): Result<void, MemberFileValidationError> {
		if (size > MAX_FILE_SIZE_BYTES) {
			return err(new MemberFileValidationError(`File '${field}' exceeds ${MAX_FILE_SIZE_BYTES} bytes limit.`))
		}

		return ok(undefined)
	}

	private storageError(message: string, cause: unknown): StorageError {
		return new StorageError(message, cause)
	}

	private buildResponse(uploadedObjectKeys: UploadedObjectKeyMap): UploadedFilePathResponse {
		// Data-driven: each field's response key comes from FIELD_DEFINITIONS,
		// making the table the single source of truth for the response shape too.
		const response = {} as Record<keyof UploadedFilePathResponse, string | null>
		for (const field of MEMBER_FILE_FIELDS) {
			const fieldDef = FIELD_DEFINITIONS[field]
			const filePath = uploadedObjectKeys[field]
			if (!filePath) {
				response[fieldDef.responseKey] = null
				continue
			}

			response[fieldDef.responseKey] = filePath
		}

		return response
	}
}

function extractExtension(filename: string): string {
	const index = filename.lastIndexOf(".")
	if (index < 0) {
		return ""
	}

	return filename.slice(index).toLowerCase()
}

function isAllowedExtension(inputExtension: string): boolean {
	return ALLOWED_EXTENSIONS.includes(inputExtension)
}
