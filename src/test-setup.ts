import "reflect-metadata"
import { vi } from "vitest"

// Mock SQL class for bun:sql compatibility in tests
export class SQL extends Function {
	// Store constructor args for inspection
	static lastConstructorArgs: unknown[] = []

	constructor(...args: unknown[]) {
		super()
		SQL.lastConstructorArgs = args
		const callable = vi.fn().mockImplementation(() => Promise.resolve([]))
		return callable
	}
}
