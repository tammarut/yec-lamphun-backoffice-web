import { createEnv } from "@t3-oss/env-nextjs";
import * as v from "valibot";

const ServerSchema = v.object({
  NODE_ENV: v.picklist(["development", "local", "test", "production"]),
  ADMIN_PASSWORD: v.pipe(v.string(), v.minLength(1, "ADMIN_PASSWORD is required")),
  DATABASE_URL: v.pipe(v.string(), v.minLength(1, "DATABASE_URL is required")),
});

const ClientSchema = v.object({});

export const envConfig = createEnv({
  server: {
    NODE_ENV: v.picklist(["development", "local", "test", "production"]),
    ADMIN_PASSWORD: v.pipe(v.string(), v.minLength(1, "ADMIN_PASSWORD is required")),
    DATABASE_URL: v.pipe(v.string(), v.minLength(1, "DATABASE_URL is required")),
  },
  client: {},
  runtimeEnv: {
    NODE_ENV: process.env["NODE_ENV"],
    ADMIN_PASSWORD: process.env["ADMIN_PASSWORD"],
    DATABASE_URL: process.env["DATABASE_URL"],
  },
});

export type EnvConfig = v.InferOutput<typeof ServerSchema> & v.InferOutput<typeof ClientSchema>;
