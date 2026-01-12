export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		try {
			// We need to import 'reflect-metadata' here because this function runs
			// before other parts of the application where it might be imported.
			await import("reflect-metadata")

			const { container, REGISTER_KEY } = await import("src/modules/container")
			const { IDatabaseClient } = await import(
				"src/shared/database/database-client.interface"
			)

			const dbClient = container.resolve(REGISTER_KEY.DATABASE_CLIENT)
			// We can't use type assertion easily here without importing the interface type properly,
			// but we know it has verifyConnection.
			// To keep it type safe we can cast to any or define a minimal interface.
			await (dbClient as any).verifyConnection()
		} catch (error) {
			console.error("Critical error during server initialization:", error)
			// Explicitly exit process if database connection fails,
			// as the user requested "throw an error" to stop startup.
			// Throwing here might be caught by Next.js and logged, but verifying strict failure is good.
			throw error
		}
	}
}
