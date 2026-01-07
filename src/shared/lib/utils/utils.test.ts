import { describe, expect, it } from "vitest"
import { cn } from "./utils"

describe("function cn (className merge utility)", () => {
	it("should merge class names", () => {
		expect(cn("foo", "bar")).toBe("foo bar")
	})

	it("should handle conditional classes", () => {
		const isActive = true
		expect(cn("base", isActive && "active")).toBe("base active")
	})

	it("should resolve Tailwind conflicts (last wins)", () => {
		expect(cn("p-4", "p-2")).toBe("p-2")
		expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500")
	})

	it("should handle undefined and null values", () => {
		expect(cn("base", undefined, null, "end")).toBe("base end")
	})

	it("should handle arrays", () => {
		expect(cn(["foo", "bar"], "baz")).toBe("foo bar baz")
	})

	it("should handle objects", () => {
		expect(cn({ foo: true, bar: false, baz: true })).toBe("foo baz")
	})
})
