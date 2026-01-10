import { createEnv } from "@t3-oss/env-nextjs";
import * as v from "valibot";

const ServerSchema = v.object({
  NODE_ENV: v.picklist(["development", "local", "test", "production"]),
  ADMIN_PASSWORD: v.pipe(v.string(), v.minLength(1, "ADMIN_PASSWORD is required")),
});

const ClientSchema = v.object({});

export const envConfig = createEnv({
  server: {
    NODE_ENV: v.picklist(["development", "local", "test", "production"]),
    ADMIN_PASSWORD: v.pipe(v.string(), v.minLength(1, "ADMIN_PASSWORD is required")),
  },
  client: {},
  runtimeEnv: {
    NODE_ENV: process.env["NODE_ENV"],
    ADMIN_PASSWORD: process.env["ADMIN_PASSWORD"],
  },
});

export type EnvConfig = v.InferOutput<typeof ServerSchema> & v.InferOutput<typeof ClientSchema>;
