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
			bun: path.resolve(__dirname, "./src/test/mocks/bun.ts"),
		},
	},
})
