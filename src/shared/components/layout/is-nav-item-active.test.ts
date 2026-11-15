import { describe, expect, it } from "vitest"

import { isNavItemActive } from "src/shared/components/layout/is-nav-item-active"

describe("isNavItemActive", () => {
	describe("Happy cases", () => {
		it("matches the item's own path exactly", () => {
			expect(isNavItemActive("/members", "/members")).toBe(true)
		})

		it("matches a nested detail path under the item", () => {
			expect(isNavItemActive("/members/5", "/members")).toBe(true)
		})

		it("matches deeply nested paths under the item", () => {
			expect(isNavItemActive("/members/5/edit", "/members")).toBe(true)
		})
	})

	describe("Unhappy cases", () => {
		it("does not match a longer sibling that only shares the prefix", () => {
			expect(isNavItemActive("/membership", "/members")).toBe(false)
		})

		it("does not match an unrelated path", () => {
			expect(isNavItemActive("/renewal", "/members")).toBe(false)
		})

		it("does not match a prefix-of-url path", () => {
			expect(isNavItemActive("/mem", "/members")).toBe(false)
		})
	})
})
