import { vi } from "vitest"

// Mock the SQL class
export const SQL = class MockSQL {
	unsafe = vi.fn().mockResolvedValue([])
	// Store constructor args for inspection
	static lastConstructorArgs: any[] = []

	constructor(...args: any[]) {
		MockSQL.lastConstructorArgs = args
	}
}

// Also export the default 'sql' tag if needed, though we are using 'SQL' class now.
// Keeping it for backward compatibility if other tests use it.
export const sql = {
	unsafe: vi.fn(),
}
