import react from "@vitejs/plugin-react"
import path from "path"
import tsconfigPaths from "vite-tsconfig-paths"
import { defineConfig } from "vitest/config"

export default defineConfig({
	plugins: [tsconfigPaths(), react()],
	test: {
		environment: "jsdom",
		setupFiles: ["src/test-setup.ts"],
		// Tests mock envConfig themselves; skip eager env validation so importing
		// modules that transitively load envConfig (e.g. the R2 storage client)
		// doesn't fail on missing server secrets in the test process.
		env: {
			SKIP_ENV_VALIDATION: "true",
			NODE_ENV: "test",
		},
	},
	resolve: {
		alias: {
			src: path.resolve(__dirname, "./src"),
			// Alias 'bun' to the test setup file which exports a mock SQL class
			bun: path.resolve(__dirname, "./src/test-setup.ts"),
		},
	},
})
