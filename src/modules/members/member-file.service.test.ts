// @vitest-environment node
import { err, ok } from "neverthrow"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"

// Mock the logger wrapper. Exposes a stable spy on `error` so the orphan-upload
// test can assert on the structured payload (message + properties object).
// `vi.hoisted` lifts the spy above `vi.mock`'s automatic hoisting; otherwise
// the const is in the TDZ when the mock factory runs.
// See docs/adr/0009-structured-logging-via-logtape.md.
const { loggerErrorSpy } = vi.hoisted(() => ({ loggerErrorSpy: vi.fn() }))
vi.mock("src/shared/lib/logger/logger", () => ({
	createLogger: () => ({
		error: loggerErrorSpy,
		warn: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
	}),
}))

import type { IIdGenerator } from "src/modules/shared/id-generator"
import type { IStorageClient } from "src/modules/shared/storage"
import { StorageError } from "src/modules/shared/storage"
import { MemberFileValidationError } from "./errors"
import { MAX_FILE_SIZE_BYTES } from "./member-file.constants"
import { MemberFileService } from "./member-file.service"

// Reusable small valid image file.
function makeImageFile(name: string, size = 1024): File {
	const blob = new Blob([new Uint8Array(size)], { type: "image/png" })
	return new File([blob], name, { type: "image/png" })
}

describe("MemberFileService", () => {
	let idGenerator: MockProxy<IIdGenerator>
	let storageClient: MockProxy<IStorageClient>
	let service: MemberFileService

	beforeEach(() => {
		vi.clearAllMocks()
		idGenerator = mock<IIdGenerator>()
		idGenerator.generate.mockReturnValue("01ULIDTEST000000000000000")
		storageClient = mock<IStorageClient>()
		storageClient.putObject.mockResolvedValue(ok(undefined))
		storageClient.getBucketName.mockImplementation((kind) => (kind === "public" ? "PUBLIC_BUCKET" : "PRIVATE_BUCKET"))
		service = new MemberFileService(idGenerator, storageClient)
		loggerErrorSpy.mockClear()
	})

	describe("uploadFiles - empty input", () => {
		it("returns a ValidationError when no files are provided", async () => {
			const result = await service.uploadFiles([])
			expect(result.isErr()).toBe(true)
			if (result.isErr()) {
				expect(result.error).toBeInstanceOf(MemberFileValidationError)
				expect(result.error.message).toContain("At least one file")
			}
			expect(storageClient.putObject).not.toHaveBeenCalled()
		})
	})

	describe("uploadFiles - validation (fail-fast)", () => {
		it("rejects a file with a disallowed extension", async () => {
			const file = new File([new Blob(["x"])], "doc.pdf", { type: "application/pdf" })
			const result = await service.uploadFiles([{ field: "id_card_image", file }])
			expect(result.isErr()).toBe(true)
			if (result.isErr()) {
				expect(result.error).toBeInstanceOf(MemberFileValidationError)
				expect(result.error.message).toContain("Invalid file type for 'id_card_image'")
			}
			expect(storageClient.putObject).not.toHaveBeenCalled()
		})

		it("rejects a file with no extension", async () => {
			const file = new File([new Blob(["x"])], "noext", { type: "image/png" })
			const result = await service.uploadFiles([{ field: "profile_avatar", file }])
			expect(result.isErr()).toBe(true)
			if (result.isErr()) {
				expect(result.error).toBeInstanceOf(MemberFileValidationError)
			}
			expect(storageClient.putObject).not.toHaveBeenCalled()
		})

		it("rejects a file exceeding the size limit", async () => {
			const file = makeImageFile("big.png", MAX_FILE_SIZE_BYTES + 1)
			const result = await service.uploadFiles([{ field: "profile_avatar", file }])
			expect(result.isErr()).toBe(true)
			if (result.isErr()) {
				expect(result.error).toBeInstanceOf(MemberFileValidationError)
				expect(result.error.message).toContain("exceeds")
				expect(result.error.message).toContain("profile_avatar")
			}
			expect(storageClient.putObject).not.toHaveBeenCalled()
		})

		it("accepts a file exactly at the size limit", async () => {
			const file = makeImageFile("max.png", MAX_FILE_SIZE_BYTES)
			const result = await service.uploadFiles([{ field: "profile_avatar", file }])
			expect(result.isOk()).toBe(true)
		})

		it("rejects the whole request when the second file is invalid", async () => {
			const good = makeImageFile("ok.png")
			const bad = new File([new Blob(["x"])], "bad.gif", { type: "image/gif" })
			const result = await service.uploadFiles([
				{ field: "profile_avatar", file: good },
				{ field: "business_logo", file: bad },
			])
			expect(result.isErr()).toBe(true)
			expect(storageClient.putObject).not.toHaveBeenCalled()
		})

		it("accepts all four allowed extensions", async () => {
			for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
				const file = makeImageFile(`avatar${ext}`)
				const result = await service.uploadFiles([{ field: "profile_avatar", file }])
				expect(result.isOk(), `extension ${ext} should be allowed`).toBe(true)
			}
		})
	})

	describe("uploadFiles - object key construction", () => {
		it("constructs the correct (bucket, key, contentType) per field", async () => {
			const file = makeImageFile("photo.JPG") // uppercase extension should be normalized
			await service.uploadFiles([{ field: "company_certificate", file }])

			expect(storageClient.putObject).toHaveBeenCalledTimes(1)
			const args = storageClient.putObject.mock.calls[0]![0]
			expect(args.bucket).toBe("PRIVATE_BUCKET")
			expect(args.key).toBe("members/documents/company_cert_01ULIDTEST000000000000000.jpg")
			expect(args.contentType).toBe("image/jpeg")
		})

		it("routes public fields to the public bucket with the short prefix", async () => {
			await service.uploadFiles([
				{ field: "profile_avatar", file: makeImageFile("a.png") },
				{ field: "business_logo", file: makeImageFile("b.png") },
				{ field: "business_product", file: makeImageFile("c.png") },
			])
			expect(storageClient.getBucketName).toHaveBeenCalledWith("public")
			const keys = storageClient.putObject.mock.calls.map((c) => c[0]!.key)
			expect(keys).toEqual([
				"members/profile_avatars/profile_avatar_01ULIDTEST000000000000000.png",
				"members/business/logo_01ULIDTEST000000000000000.png",
				"members/business/product_01ULIDTEST000000000000000.png",
			])
		})
	})

	describe("uploadFiles - fail-fast on R2 error (no cleanup)", () => {
		it("aborts on the first storage error and does not upload the rest", async () => {
			storageClient.putObject.mockResolvedValueOnce(ok(undefined)).mockResolvedValueOnce(err(new StorageError("boom")))

			const result = await service.uploadFiles([
				{ field: "id_card_image", file: makeImageFile("a.png") },
				{ field: "profile_avatar", file: makeImageFile("b.png") },
				{ field: "business_logo", file: makeImageFile("c.png") },
			])

			expect(result.isErr()).toBe(true)
			if (result.isErr()) {
				expect(result.error).toBeInstanceOf(StorageError)
			}
			// Only the first two were attempted; the third was never reached.
			expect(storageClient.putObject).toHaveBeenCalledTimes(2)
			// Orphan log should mention the first uploaded file. The structured
			// payload now carries the orphan list as a property (ADR-0009), so we
			// assert on the second argument's `orphanedUploads` array instead of
			// scraping a substring out of the message text.
			expect(loggerErrorSpy).toHaveBeenCalledTimes(1)
			const [message, properties] = loggerErrorSpy.mock.calls[0]!
			expect(message).toContain("upload aborted after failure")
			// The aborted field is the second one (the first uploaded successfully
			// and is therefore an orphan). Field prefixes/path-shapes are covered
			// by other tests, so we only assert the orphan's field tag here.
			expect(properties).toMatchObject({
				field: "profile_avatar",
				errorMessage: "boom",
				orphanedUploads: [expect.stringContaining("id_card_image=")],
			})
		})
	})

	describe("uploadFiles - response assembly", () => {
		it("returns all six keys, null for non-uploaded fields", async () => {
			const result = await service.uploadFiles([{ field: "profile_avatar", file: makeImageFile("a.png") }])
			expect(result.isOk()).toBe(true)
			if (result.isOk()) {
				expect(result.value).toEqual({
					id_card_image_file_path: null,
					company_certificate_file_path: null,
					profile_avatar_file_path: "members/profile_avatars/profile_avatar_01ULIDTEST000000000000000.png",
					business_logo_file_path: null,
					business_product_file_path: null,
					payment_slip_file_path: null,
				})
			}
		})

		it("returns all six paths when every field is uploaded", async () => {
			const result = await service.uploadFiles([
				{ field: "id_card_image", file: makeImageFile("a.jpg") },
				{ field: "company_certificate", file: makeImageFile("b.jpg") },
				{ field: "profile_avatar", file: makeImageFile("c.png") },
				{ field: "business_logo", file: makeImageFile("d.png") },
				{ field: "business_product", file: makeImageFile("e.webp") },
				{ field: "payment_slip", file: makeImageFile("f.jpg") },
			])
			expect(result.isOk()).toBe(true)
			if (result.isOk()) {
				expect(Object.keys(result.value)).toHaveLength(6)
				for (const v of Object.values(result.value)) {
					expect(v).not.toBeNull()
				}
			}
		})
	})
})
