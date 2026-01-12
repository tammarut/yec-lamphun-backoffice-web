import "reflect-metadata"
import { vi } from "vitest"

// Mock SQL class for bun:sql compatibility in tests
export class SQL extends Function {
	constructor() {
		super()
		const callable = vi.fn().mockImplementation(() => Promise.resolve([]))
		return callable
	}
}

// Mock sql tag
export const sql = {
	unsafe: vi.fn(),
}
