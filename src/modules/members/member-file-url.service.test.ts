import { err, ok } from "neverthrow"
import { beforeEach, describe, expect, test } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"
import type { IStorageUrlResolver } from "src/modules/shared/storage"
import { StorageError } from "src/modules/shared/storage"
import { MemberFileUrlService } from "./member-file-url.service"

describe("MemberFileUrlService", () => {
	let service: MemberFileUrlService
	let mockResolver: MockProxy<IStorageUrlResolver>

	beforeEach(() => {
		mockResolver = mock<IStorageUrlResolver>()
		// Default happy-path stubs; tests override per-case.
		mockResolver.presign.mockResolvedValue(ok("https://presigned.example/key"))
		// publicUrl is a plain sync string return (no Result wrapper).
		mockResolver.publicUrl.mockReturnValue("https://public.example/key")
		service = new MemberFileUrlService(mockResolver)
	})

	describe("Happy cases", () => {
		test("resolveProfileAvatarUrl returns the concatenated public URL for a non-null path", () => {
			// Q6: purpose-built single-field resolver for the list view. Sync +
			// infallible (public concat). No Result wrapper — absence is null, not err.
			const url = service.resolveProfileAvatarUrl("members/profile_avatars/a.png")
			expect(url).toBe("https://public.example/key")
			expect(mockResolver.publicUrl).toHaveBeenCalledTimes(1)
			expect(mockResolver.publicUrl).toHaveBeenCalledWith("members/profile_avatars/a.png")
			// Private resolution must NOT happen here.
			expect(mockResolver.presign).not.toHaveBeenCalled()
		})

		test("resolveProfileAvatarUrl returns null for a null path without calling the resolver", () => {
			expect(service.resolveProfileAvatarUrl(null)).toBeNull()
			expect(mockResolver.publicUrl).not.toHaveBeenCalled()
		})

		test("presigns private-bucket fields and concatenates public fields", async () => {
			const result = await service.resolveMemberFileUrls({
				idCardImage: "members/documents/id.jpg",
				companyCertificate: "members/documents/cert.jpg",
				profileAvatar: "members/profile_avatars/a.png",
				logo: "members/business/logo.png",
				product: "members/business/p.png",
			})
			const urls = result._unsafeUnwrap()
			expect(urls.idCardImage).toBe("https://presigned.example/key")
			expect(urls.companyCertificate).toBe("https://presigned.example/key")
			expect(urls.profileAvatar).toBe("https://public.example/key")
			expect(urls.logo).toBe("https://public.example/key")
			expect(urls.product).toBe("https://public.example/key")
			expect(mockResolver.presign).toHaveBeenCalledTimes(2)
			expect(mockResolver.publicUrl).toHaveBeenCalledTimes(3)
		})

		test("null paths pass through as null URLs without calling the resolver", async () => {
			const result = await service.resolveMemberFileUrls({
				idCardImage: null,
				companyCertificate: null,
				profileAvatar: null,
				logo: null,
				product: null,
			})
			expect(result._unsafeUnwrap()).toEqual({ idCardImage: null, companyCertificate: null, profileAvatar: null, logo: null, product: null })
			expect(mockResolver.presign).not.toHaveBeenCalled()
			expect(mockResolver.publicUrl).not.toHaveBeenCalled()
		})

		test("null private paths resolve ok without presigning; public fields still resolved", async () => {
			const result = await service.resolveMemberFileUrls({
				idCardImage: null,
				companyCertificate: null,
				profileAvatar: "members/profile_avatars/a.png",
				logo: null,
				product: null,
			})
			expect(result._unsafeUnwrap()).toEqual({
				idCardImage: null,
				companyCertificate: null,
				profileAvatar: "https://public.example/key",
				logo: null,
				product: null,
			})
			expect(mockResolver.presign).not.toHaveBeenCalled()
			expect(mockResolver.publicUrl).toHaveBeenCalledTimes(1)
		})
	})

	describe("Unhappy cases", () => {
		test("a presign failure propagates as err(StorageError) — infra failure is NOT degraded to null", async () => {
			// Rationale: a presign failure means R2/creds/network is broken — systemic,
			// not per-field. Degrading to null would silently lie ("member has no
			// documents") when the truth is storage is down. Propagate → 500.
			mockResolver.presign.mockResolvedValue(err(new StorageError("R2 unreachable")))
			const result = await service.resolveMemberFileUrls({
				idCardImage: "members/documents/id.jpg",
				companyCertificate: "members/documents/cert.jpg",
				profileAvatar: null,
				logo: null,
				product: null,
			})
			expect(result.isErr()).toBe(true)
			expect(result._unsafeUnwrapErr()).toBeInstanceOf(StorageError)
		})

		test("a presign failure short-circuits the combine (fail-fast on infra failure)", async () => {
			// combine short-circuits on first err — intended fail-fast behavior for
			// an infra failure that would affect both fields anyway.
			mockResolver.presign.mockResolvedValueOnce(ok("https://presigned.example/id.jpg")).mockResolvedValueOnce(err(new StorageError("boom")))
			const result = await service.resolveMemberFileUrls({
				idCardImage: "members/documents/id.jpg",
				companyCertificate: "members/documents/cert.jpg",
				profileAvatar: null,
				logo: null,
				product: null,
			})
			expect(result.isErr()).toBe(true)
		})
	})
})
