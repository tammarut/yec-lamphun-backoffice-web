export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		try {
			// We need to import 'reflect-metadata' here because this function runs
			// before other parts of the application where it might be imported.
			await import("reflect-metadata")

			const { container, REGISTER_KEY } = await import("src/modules/container")
			// Ensure DatabaseClient is resolved and verifyConnection is called
			const dbClient = container.resolve(REGISTER_KEY.DATABASE_CLIENT)

			// Cast to any to access verifyConnection since we're resolving by symbol and TS might not know the type here
			// without importing the interface.
			await (dbClient as any).verifyConnection()
		} catch (error) {
			console.error("Critical error during server initialization:", error)
			// Explicitly exit process if database connection fails,
			// as the user requested "throw an error" to stop startup.
			throw error
		}
	}
}
