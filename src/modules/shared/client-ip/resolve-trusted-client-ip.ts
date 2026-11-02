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
	const cloudflareCidrs = (cloudflareCidrsRaw ?? "")
		.split(",")
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0)
	if (isIpInAnyCidr(peer, cloudflareCidrs)) {
		const cfIp = normalizeIp(headers.get("cf-connecting-ip") ?? "")
		if (cfIp !== null) {
			return cfIp
		}
	}
	return peer
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

function isIpInAnyCidr(ip: string, cidrs: readonly string[]): boolean {
	return cidrs.some((cidr) => isIpInCidr(ip, cidr))
}

function isIpInCidr(ip: string, cidr: string): boolean {
	const slashIndex = cidr.lastIndexOf("/")
	const rangeText = slashIndex === -1 ? cidr : cidr.slice(0, slashIndex)
	const isIpv6Range = rangeText.includes(":")
	const maxBits = isIpv6Range ? 128 : 32
	const bits = slashIndex === -1 ? maxBits : Number(cidr.slice(slashIndex + 1))
	if (!Number.isInteger(bits) || bits < 0 || bits > maxBits) {
		return false
	}
	// Address family must match the range's family.
	if (ip.includes(":") !== isIpv6Range) {
		return false
	}
	const rangeIp = parseIp(rangeText)
	const candidateIp = parseIp(ip)
	if (rangeIp === null || candidateIp === null) {
		return false
	}
	const shift = BigInt(maxBits - bits)
	return candidateIp >> shift === rangeIp >> shift
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

function parseIpv6(ip: string): bigint | null {
	// `::` zero-compression, at most once; groups are 1-4 hex digits.
	const sections = ip.split("::")
	if (sections.length > 2) {
		return null
	}
	const parseGroups = (text: string): Array<number | null> => {
		if (text.length === 0) {
			return []
		}
		return text.split(":").map((group) => (/^[0-9a-fA-F]{1,4}$/.test(group) ? Number.parseInt(group, 16) : null))
	}
	const left = parseGroups(sections[0] ?? "")
	const right = sections.length === 2 ? parseGroups(sections[1] ?? "") : []
	if (left.includes(null) || right.includes(null)) {
		return null
	}
	if (sections.length === 2) {
		const missing = 8 - left.length - right.length
		if (missing < 1) {
			return null
		}
		const zeros = Array.from({ length: missing }, () => 0)
		return groupsToBigint([...left, ...zeros, ...right] as number[])
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
