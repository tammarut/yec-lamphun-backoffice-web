import { afterEach, describe, expect, it, vi } from "vitest"

import { ApiError, fetchJson } from "src/shared/lib/api/fetch-json"

function mockFetchResponse(status: number, body?: string, contentType = "application/json") {
	return new Response(body ?? null, { status, headers: { "Content-Type": contentType } })
}

describe("fetchJson", () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	describe("Happy cases", () => {
		it("should return parsed JSON body on 200", async () => {
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse(200, JSON.stringify({ name: "YEC" }))))

			const result = await fetchJson<{ name: string }>("/api/v1/members")

			expect(result.isOk()).toBe(true)
			if (result.isOk()) {
				expect(result.value).toEqual({ name: "YEC" })
			}
		})

		it("should return undefined for a 204 no-content response", async () => {
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse(204)))

			const result = await fetchJson<null>("/api/v1/auth/session")

			expect(result.isOk()).toBe(true)
			if (result.isOk()) {
				expect(result.value).toBeUndefined()
			}
		})

		it("should pass method and body through to fetch", async () => {
			const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse(200, "{}"))
			vi.stubGlobal("fetch", fetchMock)

			await fetchJson("/api/v1/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username: "admin", password: "secret" }),
			})

			expect(fetchMock).toHaveBeenCalledWith(
				"/api/v1/auth/login",
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify({ username: "admin", password: "secret" }),
				})
			)
		})
	})

	describe("Unhappy cases", () => {
		it("should return ApiError with error_message from the body on non-2xx", async () => {
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse(401, JSON.stringify({ error_message: "Unauthorized" }))))

			const result = await fetchJson("/api/v1/auth/session")

			expect(result.isErr()).toBe(true)
			if (result.isErr()) {
				expect(result.error).toBeInstanceOf(ApiError)
				expect(result.error.message).toBe("Unauthorized")
				expect(result.error.status).toBe(401)
			}
		})

		it("should fall back to a status-based message when the error body is not JSON", async () => {
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse(500, "Internal Server Error", "text/plain")))

			const result = await fetchJson("/api/v1/members")

			expect(result.isErr()).toBe(true)
			if (result.isErr()) {
				expect(result.error.status).toBe(500)
				expect(result.error.message).toBe("Request failed with status 500")
			}
		})

		it("should return ApiError with status 0 when the network request fails", async () => {
			vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))

			const result = await fetchJson("/api/v1/members")

			expect(result.isErr()).toBe(true)
			if (result.isErr()) {
				expect(result.error.status).toBe(0)
				expect(result.error.message).toBe("Network request failed")
			}
		})

		it("should return ApiError when a success body is not valid JSON", async () => {
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse(200, "not-json")))

			const result = await fetchJson("/api/v1/members")

			expect(result.isErr()).toBe(true)
			if (result.isErr()) {
				expect(result.error.status).toBe(200)
				expect(result.error.message).toBe("Invalid JSON in response body")
			}
		})
	})
})
