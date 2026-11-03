import { describe, expect, it } from "vitest"

import { GET } from "./route"

describe("GET /api/v1/health", () => {
	it("returns 204 and is deliberately unguarded — LB probes must never be throttled (SEC-1 scrutiny)", async () => {
		const response = await GET()

		expect(response.status).toBe(204)
	})
})
