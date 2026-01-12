import { vi } from "vitest"

// Mock the SQL class
// In bun, the SQL class instance is also a callable function (tagged template)
// To mock this behavior in Vitest (JS), we need to return a function that has properties attached.

export const SQL = class MockSQL extends Function {
	unsafe = vi.fn().mockResolvedValue([])
	// Store constructor args for inspection
	static lastConstructorArgs: any[] = []

	constructor(...args: any[]) {
		super() // Call Function constructor
		MockSQL.lastConstructorArgs = args

		// We need to return a proxy or a function to simulate the tagged template behavior
		// `const sql = new SQL(); await sql`SELECT 1``
		const callable = vi.fn().mockImplementation((strings, ...values) => {
			// Simulate returning a promise that resolves to an array (standard SQL result)
			return Promise.resolve([])
		})

		// Copy properties (unsafe, etc) to the callable object
		Object.assign(callable, this)

		// Ensure the prototype chain is correct-ish if needed, or just return the callable
		return callable
	}
}

// Also export the default 'sql' tag if needed
export const sql = {
	unsafe: vi.fn(),
}
