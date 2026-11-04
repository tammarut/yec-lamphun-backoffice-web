import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import type { EnvConfig } from "src/shared/config/env"
import { TurnstileService, TurnstileServiceError, TurnstileVerificationError, TURNSTILE_SITEVERIFY_URL } from "./turnstile.service"

function makeEnv(secret: string): EnvConfig {
	return { TURNSTILE_SECRET_KEY: secret, CLOUDFLARE_CIDRS: "" } as unknown as EnvConfig
}

function makeSiteverifyResponse(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), { status: status, headers: { "content-type": "application/json" } })
}

describe("TurnstileService", () => {
	let fetchMock: ReturnType<typeof vi.fn>

	beforeEach(() => {
		fetchMock = vi.fn()
		vi.stubGlobal("fetch", fetchMock)
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	describe("verify", () => {
		describe("Happy cases", () => {
			test("siteverify success=true returns ok, posting secret + token, no remoteip without proxy headers", async () => {
				const service = new TurnstileService(makeEnv("test-secret"))
				fetchMock.mockResolvedValue(makeSiteverifyResponse({ success: true }))

				const result = await service.verify("tok_abc123", new Headers())

				expect(result.isOk()).toBe(true)
				expect(fetchMock).toHaveBeenCalledTimes(1)
				const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
				expect(url).toBe(TURNSTILE_SITEVERIFY_URL)
				expect(init.method).toBe("POST")
				const body = String(init.body)
				expect(body).toContain("secret=test-secret")
				expect(body).toContain("response=tok_abc123")
				expect(body).not.toContain("remoteip")
			})

			test("remoteip comes from the shared trusted-IP helper (x-forwarded-for peer)", async () => {
				const service = new TurnstileService(makeEnv("test-secret"))
				fetchMock.mockResolvedValue(makeSiteverifyResponse({ success: true }))
				const headers = new Headers({ "x-forwarded-for": "203.0.113.9" })

				await service.verify("tok_abc123", headers)

				const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
				const body = String(init.body)
				expect(body).toContain("remoteip=203.0.113.9")
			})
		})

		describe("Unhappy cases", () => {
			test("siteverify success=false (invalid/expired token) returns TurnstileVerificationError", async () => {
				const service = new TurnstileService(makeEnv("test-secret"))
				fetchMock.mockResolvedValue(makeSiteverifyResponse({ success: false, "error-codes": ["invalid-input-response"] }))

				const result = await service.verify("tok_expired", new Headers())

				expect(result.isErr()).toBe(true)
				expect(result._unsafeUnwrapErr()).toBeInstanceOf(TurnstileVerificationError)
				expect(result._unsafeUnwrapErr().message).toBe("Human verification failed")
			})

			test("siteverify non-200 HTTP status returns TurnstileServiceError", async () => {
				const service = new TurnstileService(makeEnv("test-secret"))
				fetchMock.mockResolvedValue(makeSiteverifyResponse({ success: true }, 503))

				const result = await service.verify("tok_abc123", new Headers())

				expect(result.isErr()).toBe(true)
				expect(result._unsafeUnwrapErr()).toBeInstanceOf(TurnstileServiceError)
			})

			test("malformed siteverify JSON returns TurnstileServiceError", async () => {
				const service = new TurnstileService(makeEnv("test-secret"))
				fetchMock.mockResolvedValue(new Response("not-json", { status: 200 }))

				const result = await service.verify("tok_abc123", new Headers())

				expect(result.isErr()).toBe(true)
				expect(result._unsafeUnwrapErr()).toBeInstanceOf(TurnstileServiceError)
			})

			test("network-unreachable fetch rejection returns TurnstileServiceError", async () => {
				const service = new TurnstileService(makeEnv("test-secret"))
				fetchMock.mockRejectedValue(new Error("ECONNREFUSED"))

				const result = await service.verify("tok_abc123", new Headers())

				expect(result.isErr()).toBe(true)
				expect(result._unsafeUnwrapErr()).toBeInstanceOf(TurnstileServiceError)
				expect(result._unsafeUnwrapErr().message).toBe("Human verification is temporarily unavailable")
			})

			test("timeout-style fetch rejection (AbortError) returns TurnstileServiceError", async () => {
				const service = new TurnstileService(makeEnv("test-secret"))
				const abortError = new Error("The operation was aborted due to timeout")
				abortError.name = "TimeoutError"
				fetchMock.mockRejectedValue(abortError)

				const result = await service.verify("tok_abc123", new Headers())

				expect(result.isErr()).toBe(true)
				expect(result._unsafeUnwrapErr()).toBeInstanceOf(TurnstileServiceError)
			})

			test("EMPTY secret fails closed as TurnstileServiceError without calling siteverify", async () => {
				const service = new TurnstileService(makeEnv(""))

				const result = await service.verify("tok_abc123", new Headers())

				expect(result.isErr()).toBe(true)
				expect(result._unsafeUnwrapErr()).toBeInstanceOf(TurnstileServiceError)
				expect(fetchMock).not.toHaveBeenCalled()
			})
		})
	})
})
