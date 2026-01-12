import react from "@vitejs/plugin-react"
import path from "path"
import tsconfigPaths from "vite-tsconfig-paths"
import { defineConfig } from "vitest/config"

export default defineConfig({
	plugins: [tsconfigPaths(), react()],
	test: {
		environment: "jsdom",
		setupFiles: ["src/test-setup.ts"],
	},
	resolve: {
		alias: {
			src: path.resolve(__dirname, "./src"),
			// Alias 'bun' to the test setup file which exports a mock SQL class
			bun: path.resolve(__dirname, "./src/test-setup.ts"),
		},
	},
})
