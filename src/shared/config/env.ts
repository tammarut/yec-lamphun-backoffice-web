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
}

export const envConfig = createEnv({
	skipValidation: process.env["SKIP_ENV_VALIDATION"] === "true",
	server: {
		NODE_ENV: v.picklist(["development", "test", "production"]),
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
	},
})
