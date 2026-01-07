import * as v from "valibot"

const EnvSchema = v.object({
	NODE_ENV: v.picklist(["local", "test", "production"]),
	ADMIN_PASSWORD: v.pipe(v.string(), v.minLength(1, "ADMIN_PASSWORD is required")),
})

export const envConfig = v.parse(EnvSchema, process.env)

export type EnvConfig = v.InferOutput<typeof EnvSchema>
