import { createEnv } from "@t3-oss/env-nextjs"
import * as v from "valibot"

export type EnvConfig = {
	NODE_ENV: "development" | "test" | "production"
	ADMIN_USERNAME: string
	ADMIN_PASSWORD: string
	DATABASE_URL: string
	DB_MAX_CONNECTIONS: number
	DB_IDLE_TIMEOUT: number
	DB_CONNECTION_TIMEOUT: number
	DB_MAX_LIFETIME: number
	R2_ACCOUNT_ID: string
	R2_ACCESS_KEY_ID: string
	R2_SECRET_ACCESS_KEY: string
	R2_PUBLIC_BUCKET: string
	R2_PRIVATE_BUCKET: string
	// File-URL resolution — see docs/adr/0007-file-url-resolution-via-dedicated-resolver-and-policy-service.md
	// R2_PUBLIC_BASE_URL: external base for public-bucket objects (R2 S3 endpoint
	//   in DEV; a Cloudflare-proxied custom domain in PROD for edge caching).
	// PRESIGNED_URL_EXPIRES_IN: seconds a private-bucket presigned URL stays valid.
	R2_PUBLIC_BASE_URL: string
	PRESIGNED_URL_EXPIRES_IN: number
	// PII crypto keys — see src/modules/shared/crypto/ (AES-256-GCM + HMAC-SHA256).
	// Both are hex strings: `openssl rand -hex 32` (64 chars / 32 bytes).
	ID_CARD_AES_KEY: string
	BLIND_INDEX_HMAC_KEY: string
	// Abuse protection (SEC-1, spec #124): comma-separated Cloudflare CIDR ranges
	// (IPv4 and/or IPv6). `cf-connecting-ip` is trusted only when the
	// proxy-reported peer is inside one of these. Empty (default) = never trust.
	CLOUDFLARE_CIDRS: string
	// Abuse protection (SEC-2, spec #124): comma-separated EXTRA trusted
	// cross-origin origins for the lenient Origin/Referer gate on the
	// state-changing public routes. Same-origin traffic always passes
	// automatically (origin-gate.ts), so the site's own hostname does NOT need
	// an entry — this list is only for additional domains allowed to fire
	// these POSTs (today: none). Absent headers pass, so non-browser tooling
	// is unaffected. Empty is a valid steady state.
	ORIGIN_ALLOW_LIST: string
	// Human verification (SEC-5, spec #124): the Cloudflare Turnstile SECRET
	// key — server-only, never a NEXT_PUBLIC_ var. Empty (default) keeps the
	// gate FAIL-CLOSED: the TurnstileService refuses to call siteverify and
	// guests get a retryable 503 until the deployment sets it. The site key
	// (client-side widget) is a separate SEC-6 concern.
	CLOUDFLARE_TURNSTILE_SECRET_KEY: string
}

export const envConfig = createEnv({
	skipValidation: process.env["SKIP_ENV_VALIDATION"] === "true",
	server: {
		// Defaults to production when unset: `next dev/build/start` always set
		// NODE_ENV, but a bare `bun scripts/*` run does not — standalone entry
		// points should behave like the deployed container, which runs with
		// NODE_ENV=production (PR #109 scrutiny finding 2).
		NODE_ENV: v.optional(v.picklist(["development", "test", "production"]), "production"),
		ADMIN_USERNAME: v.pipe(v.string(), v.minLength(1, "ADMIN_USERNAME is required")),
		ADMIN_PASSWORD: v.pipe(v.string(), v.minLength(1, "ADMIN_PASSWORD is required")),
		DATABASE_URL: v.pipe(v.string(), v.minLength(1, "DATABASE_URL is required")),
		DB_MAX_CONNECTIONS: v.optional(v.pipe(v.string(), v.transform(Number), v.integer()), "10"),
		DB_IDLE_TIMEOUT: v.optional(v.pipe(v.string(), v.transform(Number), v.integer()), "30"),
		DB_CONNECTION_TIMEOUT: v.optional(v.pipe(v.string(), v.transform(Number), v.integer()), "30"),
		DB_MAX_LIFETIME: v.optional(v.pipe(v.string(), v.transform(Number), v.integer()), "3600"),
		// Cloudflare R2 (S3-compatible) — used by the members file upload module.
		// See docs/adr/0002-r2-two-bucket-public-private-split.md
		R2_ACCOUNT_ID: v.pipe(v.string(), v.minLength(1, "R2_ACCOUNT_ID is required")),
		R2_ACCESS_KEY_ID: v.pipe(v.string(), v.minLength(1, "R2_ACCESS_KEY_ID is required")),
		R2_SECRET_ACCESS_KEY: v.pipe(v.string(), v.minLength(1, "R2_SECRET_ACCESS_KEY is required")),
		R2_PUBLIC_BUCKET: v.pipe(v.string(), v.minLength(1, "R2_PUBLIC_BUCKET is required")),
		R2_PRIVATE_BUCKET: v.pipe(v.string(), v.minLength(1, "R2_PRIVATE_BUCKET is required")),
		// File-URL resolution (ADR-0007). Both required, no defaults — matches the
		// existing R2 vars; forces explicit config per environment.
		R2_PUBLIC_BASE_URL: v.pipe(v.string(), v.minLength(1, "R2_PUBLIC_BASE_URL is required")),
		PRESIGNED_URL_EXPIRES_IN: v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1, "PRESIGNED_URL_EXPIRES_IN must be a positive integer")),
		// PII crypto keys — hex-encoded 32-byte values (64 hex chars). Only loosely
		// checked here; the crypto adapters re-validate the decoded byte length.
		ID_CARD_AES_KEY: v.pipe(v.string(), v.minLength(1, "ID_CARD_AES_KEY is required")),
		BLIND_INDEX_HMAC_KEY: v.pipe(v.string(), v.minLength(32, "BLIND_INDEX_HMAC_KEY must be at least 32 chars")),
		// Comma-separated CIDR list; empty/absent → never trust cf-connecting-ip.
		// The consumer (resolveTrustedClientIp) does the splitting — kept a plain
		// string here like the DB_* numeric-string inputs.
		CLOUDFLARE_CIDRS: v.optional(v.string(), ""),
		// Comma-separated origin list for the lenient Origin/Referer gate
		// (origin-gate.ts does the splitting/parsing, like CLOUDFLARE_CIDRS).
		ORIGIN_ALLOW_LIST: v.optional(v.string(), ""),
		// Turnstile secret key (SEC-5). Empty default = fail-closed 503 for
		// guests until configured; staff sessions skip the gate regardless.
		CLOUDFLARE_TURNSTILE_SECRET_KEY: v.optional(v.string(), ""),
	},
	client: {},
	runtimeEnv: {
		NODE_ENV: process.env["NODE_ENV"],
		ADMIN_USERNAME: process.env["ADMIN_USERNAME"],
		ADMIN_PASSWORD: process.env["ADMIN_PASSWORD"],
		DATABASE_URL: process.env["DATABASE_URL"],
		DB_MAX_CONNECTIONS: process.env["DB_MAX_CONNECTIONS"],
		DB_IDLE_TIMEOUT: process.env["DB_IDLE_TIMEOUT"],
		DB_CONNECTION_TIMEOUT: process.env["DB_CONNECTION_TIMEOUT"],
		DB_MAX_LIFETIME: process.env["DB_MAX_LIFETIME"],
		R2_ACCOUNT_ID: process.env["R2_ACCOUNT_ID"],
		R2_ACCESS_KEY_ID: process.env["R2_ACCESS_KEY_ID"],
		R2_SECRET_ACCESS_KEY: process.env["R2_SECRET_ACCESS_KEY"],
		R2_PUBLIC_BUCKET: process.env["R2_PUBLIC_BUCKET"],
		R2_PRIVATE_BUCKET: process.env["R2_PRIVATE_BUCKET"],
		R2_PUBLIC_BASE_URL: process.env["R2_PUBLIC_BASE_URL"],
		PRESIGNED_URL_EXPIRES_IN: process.env["PRESIGNED_URL_EXPIRES_IN"],
		ID_CARD_AES_KEY: process.env["ID_CARD_AES_KEY"],
		BLIND_INDEX_HMAC_KEY: process.env["BLIND_INDEX_HMAC_KEY"],
		CLOUDFLARE_CIDRS: process.env["CLOUDFLARE_CIDRS"],
		ORIGIN_ALLOW_LIST: process.env["ORIGIN_ALLOW_LIST"],
		CLOUDFLARE_TURNSTILE_SECRET_KEY: process.env["CLOUDFLARE_TURNSTILE_SECRET_KEY"],
	},
})
