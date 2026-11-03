/**
 * Trusted client-IP derivation for abuse keying (SEC-1, spec #124 decision).
 *
 * Next.js route handlers expose no socket peer address, so the peer is the
 * RIGHTMOST `x-forwarded-for` hop — the address our own reverse proxy appended
 * (client-supplied earlier hops are ignored; this replaces the spoofable
 * "first token" read the login route used to do).
 *
 * `cf-connecting-ip` is trusted ONLY when that peer is inside the
 * env-configured Cloudflare CIDR list (`CLOUDFLARE_CIDRS`, a raw
 * comma-separated string) — i.e. the connection genuinely came through
 * Cloudflare. Otherwise the peer address itself is the client IP.
 *
 * Returns null when no proxy-reported peer exists (e.g. direct dev loopback).
 *
 * Known limit (SEC-1 review): the peer is only as trustworthy as the origin's
 * own reverse proxy — it must overwrite (not forward) `x-forwarded-for` the
 * way Traefik/Dokploy does by default, or a direct-to-origin attacker could
 * rotate the key header per request. Upgrade path: a platform socket-peer API.
 */
export function resolveTrustedClientIp(headers: Headers, cloudflareCidrsRaw: string | null | undefined): string | null {
	const peer = normalizeIp(headers.get("x-forwarded-for")?.split(",").at(-1) ?? "")
	if (peer === null) {
		return null
	}
	const cloudflareCidrs = parseCidrList(cloudflareCidrsRaw ?? "")
	if (isIpInAnyCidr(peer, cloudflareCidrs)) {
		const cfIp = normalizeIp(headers.get("cf-connecting-ip") ?? "")
		// NIT fix (SEC-1 scrutiny): a malformed CF header must not become the
		// trusted key — fall back to the peer instead.
		if (cfIp !== null && parseIp(cfIp) !== null) {
			return cfIp
		}
	}
	return peer
}

type ParsedCidr = {
	rangeIp: bigint
	shift: bigint
	isIpv6: boolean
}

// The env CIDR string is immutable per process, so a single-slot memo turns
// the per-request split/trim/regex/BigInt-parse work (scrutiny MAJOR, PR #132)
// into one plain compare loop. Tests pass varying literals → cache misses.
let cidrCacheRaw: string | null = null
let cidrCache: ParsedCidr[] = []

function parseCidrList(raw: string): ParsedCidr[] {
	if (raw === cidrCacheRaw) {
		return cidrCache
	}
	const entries = raw.split(",")
	const parsed: ParsedCidr[] = []
	for (const entry of entries) {
		const trimmed = entry.trim()
		if (trimmed.length === 0) {
			continue
		}
		const cidr = parseCidr(trimmed)
		if (cidr !== null) {
			parsed.push(cidr)
		}
	}
	cidrCacheRaw = raw
	cidrCache = parsed
	return parsed
}

function parseCidr(cidr: string): ParsedCidr | null {
	const slashIndex = cidr.lastIndexOf("/")
	const rangeText = slashIndex === -1 ? cidr : cidr.slice(0, slashIndex)
	const isIpv6 = rangeText.includes(":")
	const maxBits = isIpv6 ? 128 : 32
	const bits = slashIndex === -1 ? maxBits : Number(cidr.slice(slashIndex + 1))
	if (!Number.isInteger(bits) || bits < 0 || bits > maxBits) {
		return null
	}
	const rangeIp = parseIp(rangeText)
	if (rangeIp === null) {
		return null
	}
	return { rangeIp: rangeIp, shift: BigInt(maxBits - bits), isIpv6: isIpv6 }
}

/** Strip surrounding space and the IPv4-mapped-IPv6 prefix (`::ffff:a.b.c.d`). */
function normalizeIp(raw: string): string | null {
	const trimmed = raw.trim()
	if (trimmed.length === 0) {
		return null
	}
	if (trimmed.toLowerCase().startsWith("::ffff:")) {
		const mapped = trimmed.slice("::ffff:".length)
		if (mapped.includes(".")) {
			return mapped
		}
	}
	return trimmed
}

function isIpInAnyCidr(ip: string, cidrs: readonly ParsedCidr[]): boolean {
	const candidateIp = parseIp(ip)
	if (candidateIp === null) {
		return false
	}
	const isIpv6 = ip.includes(":")
	for (const cidr of cidrs) {
		if (cidr.isIpv6 !== isIpv6) {
			continue
		}
		if (candidateIp >> cidr.shift === cidr.rangeIp >> cidr.shift) {
			return true
		}
	}
	return false
}

function parseIp(ip: string): bigint | null {
	return ip.includes(":") ? parseIpv6(ip) : parseIpv4(ip)
}

function parseIpv4(ip: string): bigint | null {
	const parts = ip.split(".")
	if (parts.length !== 4) {
		return null
	}
	let value = 0n
	for (const part of parts) {
		if (!/^\d{1,3}$/.test(part)) {
			return null
		}
		const octet = Number(part)
		if (octet > 255) {
			return null
		}
		value = (value << 8n) | BigInt(octet)
	}
	return value
}

// Parse the colon-separated groups of one half of an IPv6 address. Each group
// is 1-4 hex digits; an invalid group yields null so the caller can reject.
function parseGroups(text: string): Array<number | null> {
	const groups: Array<number | null> = []
	if (text.length === 0) {
		return groups
	}
	for (const group of text.split(":")) {
		const isValidHexGroup = /^[0-9a-fA-F]{1,4}$/.test(group)
		if (isValidHexGroup) {
			groups.push(Number.parseInt(group, 16))
		} else {
			groups.push(null)
		}
	}
	return groups
}

// parseGroups rejected nothing — this narrowing tells the compiler the list
// holds only numbers once the null check has passed.
function isFullyParsed(groups: Array<number | null>): groups is number[] {
	return !groups.includes(null)
}

function parseIpv6(ip: string): bigint | null {
	// `::` zero-compression, at most once.
	const sections = ip.split("::")
	if (sections.length > 2) {
		return null
	}
	const left = parseGroups(sections[0] ?? "")
	const right = sections.length === 2 ? parseGroups(sections[1] ?? "") : []
	if (!isFullyParsed(left) || !isFullyParsed(right)) {
		return null
	}
	if (sections.length === 2) {
		const missing = 8 - left.length - right.length
		if (missing < 1) {
			return null
		}
		const groups: number[] = []
		for (const group of left) {
			groups.push(group)
		}
		for (let i = 0; i < missing; i += 1) {
			groups.push(0)
		}
		for (const group of right) {
			groups.push(group)
		}
		return groupsToBigint(groups)
	}
	if (left.length !== 8) {
		return null
	}
	return groupsToBigint(left as number[])
}

function groupsToBigint(groups: number[]): bigint {
	let value = 0n
	for (const group of groups) {
		value = (value << 16n) | BigInt(group)
	}
	return value
}
