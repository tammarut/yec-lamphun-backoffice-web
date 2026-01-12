import { createEnv } from "@t3-oss/env-nextjs";
import * as v from "valibot";

const ServerSchema = v.object({
  NODE_ENV: v.picklist(["development", "local", "test", "production"]),
  ADMIN_PASSWORD: v.pipe(v.string(), v.minLength(1, "ADMIN_PASSWORD is required")),
  DATABASE_URL: v.pipe(v.string(), v.minLength(1, "DATABASE_URL is required")),
  DB_MAX_CONNECTIONS: v.optional(v.pipe(v.string(), v.transform(Number), v.integer()), 10),
  DB_IDLE_TIMEOUT: v.optional(v.pipe(v.string(), v.transform(Number), v.integer()), 30),
  DB_CONNECTION_TIMEOUT: v.optional(v.pipe(v.string(), v.transform(Number), v.integer()), 30),
});

const ClientSchema = v.object({});

export const envConfig = createEnv({
  server: {
    NODE_ENV: v.picklist(["development", "local", "test", "production"]),
    ADMIN_PASSWORD: v.pipe(v.string(), v.minLength(1, "ADMIN_PASSWORD is required")),
    DATABASE_URL: v.pipe(v.string(), v.minLength(1, "DATABASE_URL is required")),
    DB_MAX_CONNECTIONS: v.optional(v.pipe(v.string(), v.transform(Number), v.integer()), 10),
    DB_IDLE_TIMEOUT: v.optional(v.pipe(v.string(), v.transform(Number), v.integer()), 30),
    DB_CONNECTION_TIMEOUT: v.optional(v.pipe(v.string(), v.transform(Number), v.integer()), 30),
  },
  client: {},
  runtimeEnv: {
    NODE_ENV: process.env["NODE_ENV"],
    ADMIN_PASSWORD: process.env["ADMIN_PASSWORD"],
    DATABASE_URL: process.env["DATABASE_URL"],
    DB_MAX_CONNECTIONS: process.env["DB_MAX_CONNECTIONS"],
    DB_IDLE_TIMEOUT: process.env["DB_IDLE_TIMEOUT"],
    DB_CONNECTION_TIMEOUT: process.env["DB_CONNECTION_TIMEOUT"],
  },
});

export type EnvConfig = v.InferOutput<typeof ServerSchema> & v.InferOutput<typeof ClientSchema>;
