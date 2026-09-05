import type { NextConfig } from "next"
import { envConfig } from "./src/shared/config/env"

const appEnv = process.env["NODE_ENV"]
const isProduction = appEnv === "production"

// Public member files (avatars, logos, products) render from the R2 public
// base URL — the r2.dev endpoint in dev, a Cloudflare-proxied custom domain in
// prod (ADR-0007). CSP img-src must allow that origin, derived from config so
// each environment allow-lists exactly its own host.
const publicFileOrigin = new URL(envConfig.R2_PUBLIC_BASE_URL).origin

// Security headers (OWASP recommended)
const securityHeaders = [
	{ key: "X-Content-Type-Options", value: "nosniff" },
	{ key: "X-Frame-Options", value: "SAMEORIGIN" },
	{ key: "X-XSS-Protection", value: "1; mode=block" },
	{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
	{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
	{ key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
	{
		key: "Content-Security-Policy",
		value: isProduction
			? `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: ${publicFileOrigin}; font-src 'self'; connect-src 'self'; frame-src none; object-src 'none';`
			: `default-src 'self' 'unsafe-eval'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: ${publicFileOrigin}; font-src 'self'; connect-src 'self' http://localhost:*`,
	},
]

const nextConfig: NextConfig = {
	serverExternalPackages: ["bun", "@aws-sdk/client-s3"],
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "images.unsplash.com",
			},
		],
	},
	output: isProduction ? "standalone" : undefined,
	reactStrictMode: true,
	poweredByHeader: false,
	trailingSlash: false, // or true, based on your routing preference
	compiler: {
		removeConsole: isProduction,
	},

	async headers() {
		return [
			{
				source: "/(.*)",
				headers: securityHeaders,
			},
		]
	},
}

export default nextConfig
