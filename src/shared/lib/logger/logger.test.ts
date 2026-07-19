import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock @logtape/logtape BEFORE importing the wrapper so configure/getLogger are
// spies we can assert on. The wrapper under test is the only thing imported
// for real; everything from LogTape is replaced.
vi.mock("@logtape/logtape", () => {
	const configure = vi.fn().mockResolvedValue(undefined)
	const getLogger = vi.fn().mockReturnValue({
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
	})
	return {
		configure,
		getLogger,
		getConsoleSink: vi.fn().mockReturnValue("console-sink"),
		getStreamSink: vi.fn().mockReturnValue("stream-sink"),
		getJsonLinesFormatter: vi.fn().mockReturnValue("json-formatter"),
	}
})

// Reset the module-level `configured` flag between tests by re-importing fresh.
async function importFresh() {
	vi.resetModules()
	return (await import("./logger")) as typeof import("./logger")
}

describe("shared/lib/logger", () => {
	describe("createLogger", () => {
		describe("Happy cases", () => {
			it("prepends the app root category to the caller's category", async () => {
				const { createLogger } = await importFresh()
				const { getLogger } = await import("@logtape/logtape")

				createLogger(["members", "route", "create"])

				expect(getLogger).toHaveBeenCalledWith(["yec-lamphun", "members", "route", "create"])
			})

			it("returns the logger produced by getLogger", async () => {
				const { createLogger } = await importFresh()

				const logger = createLogger(["shared", "db"])

				// The mock getLogger returns an object with the log methods.
				expect(logger).toHaveProperty("error")
				expect(logger).toHaveProperty("warn")
				expect(logger).toHaveProperty("info")
				expect(logger).toHaveProperty("debug")
			})
		})
	})

	describe("configureLogger", () => {
		beforeEach(() => {
			vi.clearAllMocks()
		})

		describe("Happy cases", () => {
			it("calls configure once with the prod sink split when NODE_ENV=production", async () => {
				vi.stubEnv("NODE_ENV", "production")
				const { configureLogger } = await importFresh()
				const { configure } = await import("@logtape/logtape")

				await configureLogger()

				expect(configure).toHaveBeenCalledTimes(1)
				const configArg = (configure as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
					loggers: Array<{ sinks: string[]; lowestLevel: string; category: readonly string[] }>
				}
				expect(configArg.loggers[0]!.sinks).toEqual(["stream"])
				expect(configArg.loggers[0]!.lowestLevel).toBe("info")
				expect(configArg.loggers[0]!.category).toEqual(["yec-lamphun"])
			})

			it("selects the console sink and debug floor when NODE_ENV is not production", async () => {
				vi.stubEnv("NODE_ENV", "development")
				const { configureLogger } = await importFresh()
				const { configure } = await import("@logtape/logtape")

				await configureLogger()

				expect(configure).toHaveBeenCalledTimes(1)
				const configArg = (configure as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
					loggers: Array<{ sinks: string[]; lowestLevel: string }>
				}
				expect(configArg.loggers[0]!.sinks).toEqual(["console"])
				expect(configArg.loggers[0]!.lowestLevel).toBe("debug")
			})

			it("is a no-op on the second call (the configured guard)", async () => {
				vi.stubEnv("NODE_ENV", "development")
				const { configureLogger } = await importFresh()
				const { configure } = await import("@logtape/logtape")

				await configureLogger()
				await configureLogger()

				expect(configure).toHaveBeenCalledTimes(1)
			})
		})
	})
})
