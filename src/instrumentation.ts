export async function register() {
	if (process.env["NEXT_RUNTIME"] === "nodejs") {
		try {
			// We need to import 'reflect-metadata' here because this function runs
			// before other parts of the application where it might be imported.
			await import("reflect-metadata")

			const { container } = await import("src/modules/container")
			const { DatabaseClient } = await import("src/shared/database/database-client")

			// Ensure DatabaseClient is resolved and verifyConnection is called
			const dbClient = container.resolve(DatabaseClient)
			const result = await dbClient.verifyConnection()

			if (result.isErr()) {
				// Log removed to prevent blocking main thread
				// Explicitly exit process if database connection fails,
				// as the user requested "throw an error" to stop startup.
				throw result.error
			}
		} catch (error) {
			// Log removed to prevent blocking main thread
			// Explicitly exit process if database connection fails,
			// as the user requested "throw an error" to stop startup.
			throw error
		}
	}
}
