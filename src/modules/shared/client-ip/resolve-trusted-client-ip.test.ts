import { describe, expect, it } from "vitest"

import { resolveTrustedClientIp } from "./resolve-trusted-client-ip"

const CF_V4_CIDRS = "173.245.48.0/20, 103.21.244.0/22"
const CF_V6_CIDRS = "2400:cb00::/32, 2606:4700::/32"

function headersWith(entries: Record<string, string>): Headers {
	return new Headers(entries)
}

describe("resolveTrustedClientIp", () => {
	describe("Happy cases", () => {
		it("trusts cf-connecting-ip when the peer is inside the Cloudflare CIDR list", () => {
			const headers = headersWith({ "x-forwarded-for": "103.21.244.7", "cf-connecting-ip": "198.51.100.23" })
			const ip = resolveTrustedClientIp(headers, CF_V4_CIDRS)
			expect(ip).toBe("198.51.100.23")
		})

		it("matches IPv6 Cloudflare peers against IPv6 CIDRs", () => {
			const headers = headersWith({ "x-forwarded-for": "2400:cb00:1234::1", "cf-connecting-ip": "2001:db8::9" })
			const ip = resolveTrustedClientIp(headers, CF_V6_CIDRS)
			expect(ip).toBe("2001:db8::9")
		})

		it("matches an IPv4-mapped peer against IPv4 CIDRs", () => {
			const headers = headersWith({ "x-forwarded-for": "::ffff:103.21.244.7", "cf-connecting-ip": "198.51.100.23" })
			const ip = resolveTrustedClientIp(headers, CF_V4_CIDRS)
			expect(ip).toBe("198.51.100.23")
		})

		it("falls back to the peer when the peer is inside the CIDR list but no cf-connecting-ip header exists", () => {
			const headers = headersWith({ "x-forwarded-for": "103.21.244.7" })
			const ip = resolveTrustedClientIp(headers, CF_V4_CIDRS)
			expect(ip).toBe("103.21.244.7")
		})

		it("falls back to the peer when cf-connecting-ip is present but malformed (SEC-1 scrutiny NIT)", () => {
			const headers = headersWith({ "x-forwarded-for": "103.21.244.7", "cf-connecting-ip": "not-an-ip" })
			const ip = resolveTrustedClientIp(headers, CF_V4_CIDRS)
			expect(ip).toBe("103.21.244.7")
		})

		it("falls back to the peer when the CIDR list is empty (never trust the header)", () => {
			const headers = headersWith({ "x-forwarded-for": "103.21.244.7", "cf-connecting-ip": "198.51.100.23" })
			const ip = resolveTrustedClientIp(headers, "")
			expect(ip).toBe("103.21.244.7")
		})

		it("uses the RIGHTMOST x-forwarded-for hop as the peer (client-supplied earlier hops are ignored)", () => {
			const headers = headersWith({ "x-forwarded-for": "6.6.6.6, 103.21.244.7", "cf-connecting-ip": "198.51.100.23" })
			const ip = resolveTrustedClientIp(headers, CF_V4_CIDRS)
			expect(ip).toBe("198.51.100.23")
		})
	})

	describe("Unhappy cases", () => {
		it("ignores a spoofed cf-connecting-ip when the peer is NOT inside the CIDR list", () => {
			const headers = headersWith({ "x-forwarded-for": "203.0.113.9", "cf-connecting-ip": "6.6.6.6" })
			const ip = resolveTrustedClientIp(headers, CF_V4_CIDRS)
			expect(ip).toBe("203.0.113.9")
		})

		it("returns null when no x-forwarded-for peer exists (direct dev loopback)", () => {
			const headers = headersWith({ "cf-connecting-ip": "6.6.6.6" })
			const ip = resolveTrustedClientIp(headers, CF_V4_CIDRS)
			expect(ip).toBeNull()
		})

		it("returns null when x-forwarded-for is empty", () => {
			const headers = headersWith({ "x-forwarded-for": "  " })
			const ip = resolveTrustedClientIp(headers, CF_V4_CIDRS)
			expect(ip).toBeNull()
		})

		it("does not match an IPv4 peer against an IPv6-only CIDR list", () => {
			const headers = headersWith({ "x-forwarded-for": "103.21.244.7", "cf-connecting-ip": "198.51.100.23" })
			const ip = resolveTrustedClientIp(headers, CF_V6_CIDRS)
			expect(ip).toBe("103.21.244.7")
		})

		it("treats a malformed CIDR entry as no-match and falls back to the peer", () => {
			const headers = headersWith({ "x-forwarded-for": "103.21.244.7", "cf-connecting-ip": "198.51.100.23" })
			const ip = resolveTrustedClientIp(headers, "not-a-cidr")
			expect(ip).toBe("103.21.244.7")
		})
	})
})
