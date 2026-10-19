import { afterEach, describe, expect, test } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { ContactCard } from "src/modules/dashboard/components/contact-card"

afterEach(() => {
	cleanup()
})

describe("ContactCard", () => {
	describe("Happy cases", () => {
		test("shows all four contact channels with the mockup copy", () => {
			// Arrange + Act
			render(<ContactCard />)

			// Assert
			expect(screen.getByText("Facebook Page")).toBeTruthy()
			expect(screen.getByText("YEC Lamphun")).toBeTruthy()
			expect(screen.getByText("LINE Official")).toBeTruthy()
			expect(screen.getByText("@yeclamphun")).toBeTruthy()
			expect(screen.getByText("สำนักงานหอการค้าจังหวัดลำพูน")).toBeTruthy()
			expect(screen.getByText("053-510-686")).toBeTruthy()
		})

		test("links Facebook out to the real page in a new tab", () => {
			// Arrange + Act
			render(<ContactCard />)
			const link = document.querySelector("[data-slot='contact-channel-facebook']")

			// Assert
			expect(link?.getAttribute("href")).toBe("https://www.facebook.com/yeclamphun")
			expect(link?.getAttribute("target")).toBe("_blank")
			expect(link?.getAttribute("rel")).toContain("noopener")
		})

		test("keeps LINE Official as a non-link tile (mockup href=# is a dead placeholder)", () => {
			// Arrange + Act
			render(<ContactCard />)
			const tile = document.querySelector("[data-slot='contact-channel-line']")

			// Assert
			expect(tile?.tagName).not.toBe("A")
			expect(tile?.querySelector("a")).toBeNull()
		})
	})
})
