import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

const { loggerWarnSpy } = vi.hoisted(() => ({
	loggerWarnSpy: vi.fn(),
}))

vi.mock("src/modules/container", () => ({
	container: {
		resolve: vi.fn(),
	},
}))

vi.mock("src/shared/lib/logger/logger", () => ({
	createLogger: () => ({
		warn: loggerWarnSpy,
		error: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
	}),
}))

import { container } from "src/modules/container"
import { REGISTER_KEY } from "src/modules/di-tokens"
import type { EnvConfig } from "src/shared/config/env"

import { withOriginGate } from "./origin-gate"

const DEV_ALLOW_LIST = "https://yec-dev.example.com, https://yec.example.com"

describe("withOriginGate", () => {
	let handlerResponse: NextResponse<{ ok: boolean }>
	let handler: ReturnType<typeof vi.fn<(request: NextRequest, context: unknown) => Promise<NextResponse<{ ok: boolean }>>>>
	let envStub: EnvConfig

	beforeEach(() => {
		handlerResponse = NextResponse.json({ ok: true })
		handler = vi.fn<(request: NextRequest, context: unknown) => Promise<NextResponse<{ ok: boolean }>>>()
		handler.mockResolvedValue(handlerResponse)
		envStub = { ORIGIN_ALLOW_LIST: DEV_ALLOW_LIST, NODE_ENV: "test" } as unknown as EnvConfig

		vi.mocked(container.resolve).mockImplementation((token) => {
			if (token === REGISTER_KEY.ENV_CONFIG) {
				return envStub
			}
			return {}
		})

		loggerWarnSpy.mockClear()
	})

	function requestWithHeaders(headers: Record<string, string>): NextRequest {
		return new NextRequest("http://localhost/api/v1/test", {
			method: "POST",
			headers: headers,
		})
	}

	it("passes through when no Origin and no Referer header is present (non-browser tooling)", async () => {
		const guarded = withOriginGate(handler)

		const response = await guarded(requestWithHeaders({}), undefined)

		expect(response).toBe(handlerResponse)
		expect(handler).toHaveBeenCalledTimes(1)
	})

	it("passes through when the Origin header is allow-listed", async () => {
		const guarded = withOriginGate(handler)

		const response = await guarded(requestWithHeaders({ origin: "https://yec-dev.example.com" }), undefined)

		expect(response).toBe(handlerResponse)
	})

	it("returns 403 with the canonical error body when the Origin header is present but not allow-listed", async () => {
		const guarded = withOriginGate(handler)

		const response = await guarded(requestWithHeaders({ origin: "https://evil.example.net" }), undefined)

		expect(response.status).toBe(403)
		expect(await response.json()).toEqual({ error_message: "Forbidden" })
		expect(handler).not.toHaveBeenCalled()
	})

	it("returns 403 on the Referer fallback: present, no Origin, not allow-listed", async () => {
		const guarded = withOriginGate(handler)

		const response = await guarded(requestWithHeaders({ referer: "https://evil.example.net/renewal-form" }), undefined)

		expect(response.status).toBe(403)
		expect(await response.json()).toEqual({ error_message: "Forbidden" })
		expect(handler).not.toHaveBeenCalled()
	})

	it("passes through on the Referer fallback when the Referer origin is allow-listed", async () => {
		const guarded = withOriginGate(handler)

		const response = await guarded(requestWithHeaders({ referer: "https://yec.example.com/membership/renewal?step=2" }), undefined)

		expect(response).toBe(handlerResponse)
	})

	it("blocks the literal `Origin: null` (opaque origin — never allow-listable)", async () => {
		const guarded = withOriginGate(handler)

		const response = await guarded(requestWithHeaders({ origin: "null" }), undefined)

		expect(response.status).toBe(403)
		expect(handler).not.toHaveBeenCalled()
	})

	it("normalizes case and default ports: `HTTPS://YEC.EXAMPLE.COM:443` matches `https://yec.example.com`", async () => {
		const guarded = withOriginGate(handler)

		const response = await guarded(requestWithHeaders({ origin: "HTTPS://YEC.EXAMPLE.COM:443" }), undefined)

		expect(response).toBe(handlerResponse)
	})

	it("ignores malformed allow-list entries instead of rejecting every request", async () => {
		envStub = { ORIGIN_ALLOW_LIST: "not-a-url,,,https://yec.example.com", NODE_ENV: "test" } as unknown as EnvConfig
		const guarded = withOriginGate(handler)

		const response = await guarded(requestWithHeaders({ origin: "https://yec.example.com" }), undefined)

		expect(response).toBe(handlerResponse)
	})

	it("blocks every FOREIGN Origin-bearing request when the allow-list is empty", async () => {
		envStub = { ORIGIN_ALLOW_LIST: "", NODE_ENV: "test" } as unknown as EnvConfig
		const guarded = withOriginGate(handler)

		const response = await guarded(requestWithHeaders({ origin: "https://yec.example.com" }), undefined)

		expect(response.status).toBe(403)
	})

	it("auto-allows the SAME-ORIGIN request even with an empty allow-list (scrutiny MAJOR-3: browsers always send Origin on POSTs)", async () => {
		envStub = { ORIGIN_ALLOW_LIST: "", NODE_ENV: "test" } as unknown as EnvConfig
		const guarded = withOriginGate(handler)

		const response = await guarded(requestWithHeaders({ origin: "http://localhost" }), undefined)

		expect(response).toBe(handlerResponse)
		expect(handler).toHaveBeenCalledTimes(1)
	})

	it("auto-allows a same-origin Referer with an empty allow-list", async () => {
		envStub = { ORIGIN_ALLOW_LIST: "", NODE_ENV: "test" } as unknown as EnvConfig
		const guarded = withOriginGate(handler)

		const response = await guarded(requestWithHeaders({ referer: "http://localhost/membership/renewal" }), undefined)

		expect(response).toBe(handlerResponse)
	})

	it("does NOT let a host-suffix lookalike pass as same-origin", async () => {
		envStub = { ORIGIN_ALLOW_LIST: "", NODE_ENV: "test" } as unknown as EnvConfig
		const guarded = withOriginGate(handler)

		const response = await guarded(requestWithHeaders({ origin: "http://localhost.evil.com" }), undefined)

		expect(response.status).toBe(403)
	})

	it("logs a structured line with endpoint and blocked origin on every 403", async () => {
		const guarded = withOriginGate(handler)

		await guarded(requestWithHeaders({ origin: "https://evil.example.net" }), undefined)

		expect(loggerWarnSpy).toHaveBeenCalledTimes(1)
		expect(loggerWarnSpy).toHaveBeenCalledWith(
			expect.stringContaining("endpoint={endpoint}"),
			expect.objectContaining({
				endpoint: "/api/v1/test",
				blockedOrigin: "https://evil.example.net",
			})
		)
	})

	it("bypasses the gate entirely in development (same-origin localhost traffic)", async () => {
		envStub = { ORIGIN_ALLOW_LIST: "", NODE_ENV: "development" } as unknown as EnvConfig
		const guarded = withOriginGate(handler)

		const response = await guarded(requestWithHeaders({ origin: "http://localhost:3000" }), undefined)

		expect(response).toBe(handlerResponse)
		expect(handler).toHaveBeenCalledTimes(1)
	})

	it("passes the context through to the handler", async () => {
		const guarded = withOriginGate(handler)
		const request = requestWithHeaders({})
		const context = { params: {} }

		await guarded(request, context)

		expect(handler).toHaveBeenCalledWith(request, context)
	})
})
