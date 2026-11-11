// @vitest-environment node
import { err } from "neverthrow"
import { NextRequest } from "next/server"
import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mock } from "vitest-mock-extended"

// Mock container module BEFORE importing the gate.
vi.mock("src/modules/container", () => ({
	container: {
		resolve: vi.fn(),
	},
}))

import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { AuthService } from "src/modules/auth"
import { TURNSTILE_TOKEN_HEADER } from "src/modules/shared/turnstile/constants"
import { TurnstileServiceError, TurnstileVerificationError } from "src/modules/shared/turnstile/errors"
import { TurnstileService } from "src/modules/shared/turnstile/turnstile.service"

// Import gate AFTER mocks.
import { enforceTurnstileToken } from "./turnstile-gate"

const BYPASS_TOKEN = "test-bypass-secret"

// The ENV_CONFIG the beforeEach container mock hands out — a mutable holder so
// individual tests override just the env without re-inlining the whole
// mockImplementation (the closure reads it at resolve time).
let envMock: Record<string, string>

function makeEnv(overrides: Record<string, string> = {}) {
	return { NODE_ENV: "test", ORIGIN_ALLOW_LIST: "", CLOUDFLARE_TURNSTILE_TEST_BYPASS_TOKEN: "", ...overrides }
}

function makeRequest(turnstileToken: string | null): NextRequest {
	const headers: Record<string, string> = {}
	if (turnstileToken !== null) {
		headers[TURNSTILE_TOKEN_HEADER] = turnstileToken
	}
	return new NextRequest("http://localhost/api/v1/membership/renewals", {
		method: "POST",
		body: JSON.stringify({ member_ids: [1], payment_slip: "p.jpg" }),
		headers: headers,
	})
}

describe("enforceTurnstileToken — env-gated test bypass (#138)", () => {
	let mockAuthService: ReturnType<typeof mock<AuthService>>
	let mockTurnstileService: ReturnType<typeof mock<TurnstileService>>

	beforeEach(() => {
		// Arrange (shared setup): guest path defaults. validateSession defaults to
		// INVALID and verify defaults to REJECTED, so a bypass pass can only come
		// from the bypass branch — a wrongly-called siteverify flips the response
		// to 403 and fails the test.
		vi.clearAllMocks()
		mockAuthService = mock<AuthService>()
		mockTurnstileService = mock<TurnstileService>()
		mockAuthService.validateSession.mockReturnValue(err(new Error("invalid session")))
		mockTurnstileService.verify.mockResolvedValue(err(new TurnstileVerificationError()))
		envMock = makeEnv({ CLOUDFLARE_TURNSTILE_TEST_BYPASS_TOKEN: BYPASS_TOKEN })
		vi.mocked(container.resolve).mockImplementation((token) => {
			if (token === REGISTER_KEY.ENV_CONFIG) {
				return envMock
			}
			if (token === REGISTER_KEY.AUTH_SERVICE) {
				return mockAuthService
			}
			if (token === REGISTER_KEY.TURNSTILE_SERVICE) {
				return mockTurnstileService
			}
			return {}
		})
	})

	describe("Happy cases", () => {
		it("bypass env set + exact header value: passes WITHOUT a siteverify round-trip", async () => {
			const request = makeRequest(BYPASS_TOKEN)

			const rejection = await enforceTurnstileToken(request, false)

			expect(rejection).toBeNull()
			expect(mockTurnstileService.verify).not.toHaveBeenCalled()
		})

		it("ADMIN (valid cookie) skips the gate entirely — unchanged by the bypass (regression)", async () => {
			const rejection = await enforceTurnstileToken(makeRequest(null), true)

			expect(rejection).toBeNull()
			expect(mockTurnstileService.verify).not.toHaveBeenCalled()
		})
	})

	describe("Unhappy cases", () => {
		it("bypass env set + wrong value: falls through to the real siteverify flow (403 token verdict)", async () => {
			const request = makeRequest("junk-token")

			const rejection = await enforceTurnstileToken(request, false)

			expect(rejection).not.toBeNull()
			expect(rejection?.status).toBe(403)
			const json = (await rejection!.json()) as { error_message: string }
			expect(json.error_message).toBe("Human verification failed")
			expect(mockTurnstileService.verify).toHaveBeenCalledTimes(1)
			expect(mockTurnstileService.verify).toHaveBeenCalledWith("junk-token", request.headers)
		})

		it("bypass env UNSET: the candidate value is treated as an ordinary token (real siteverify path)", async () => {
			envMock = makeEnv()

			const rejection = await enforceTurnstileToken(makeRequest(BYPASS_TOKEN), false)

			expect(rejection).not.toBeNull()
			expect(rejection?.status).toBe(403)
			expect(mockTurnstileService.verify).toHaveBeenCalledTimes(1)
		})

		it("bypass env set + MISSING header: still 403 fast-fail without siteverify", async () => {
			const rejection = await enforceTurnstileToken(makeRequest(null), false)

			expect(rejection).not.toBeNull()
			expect(rejection?.status).toBe(403)
			const json = (await rejection!.json()) as { error_message: string }
			expect(json.error_message).toBe("Human verification failed")
			expect(mockTurnstileService.verify).not.toHaveBeenCalled()
		})

		it("bypass env set + WHITESPACE-ONLY header: still 403 fast-fail (scrutiny MINOR-1 holds even with the bypass active)", async () => {
			const rejection = await enforceTurnstileToken(makeRequest("   "), false)

			expect(rejection).not.toBeNull()
			expect(rejection?.status).toBe(403)
			expect(mockTurnstileService.verify).not.toHaveBeenCalled()
		})

		it("siteverify infra failure on a NON-bypass token stays 503 (bypass does not widen the service-fault path)", async () => {
			mockTurnstileService.verify.mockResolvedValue(err(new TurnstileServiceError("Human verification is temporarily unavailable")))

			const rejection = await enforceTurnstileToken(makeRequest("junk-token"), false)

			expect(rejection?.status).toBe(503)
			const json = (await rejection!.json()) as { error_message: string }
			expect(json.error_message).toBe("Human verification is temporarily unavailable")
		})
	})
})
