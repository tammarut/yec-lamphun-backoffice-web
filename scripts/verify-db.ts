import "reflect-metadata"
import { container, REGISTER_KEY } from "src/modules/container"
import { IDatabaseClient } from "src/shared/database/database-client.interface"

async function verifyDb() {
	try {
		console.log("Verifying database connection...")
		const dbClient = container.resolve<IDatabaseClient>(
			REGISTER_KEY.DATABASE_CLIENT,
		)
		// Use the verifyConnection method which internally uses getSql() and tagged templates
		await dbClient.verifyConnection()

		// To demonstrate getSql usage in script:
		const sql = dbClient.getSql()
		const result = await sql`SELECT 1 as result`

		console.log("Connection successful! Result:", result)
		process.exit(0)
	} catch (error) {
		console.error("Database verification failed:", error)
		process.exit(1)
	}
}

verifyDb()
