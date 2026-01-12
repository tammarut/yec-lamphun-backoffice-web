import "reflect-metadata"
import { container, REGISTER_KEY } from "src/modules/container"
import { ISqlClient } from "src/shared/database/sql-client.interface"

async function verifyDb() {
	try {
		console.log("Verifying database connection...")
		const sqlClient = container.resolve<ISqlClient>(REGISTER_KEY.SQL_CLIENT)
		const result = await sqlClient.query("SELECT 1 as result")
		console.log("Connection successful! Result:", result)
		process.exit(0)
	} catch (error) {
		console.error("Database verification failed:", error)
		process.exit(1)
	}
}

verifyDb()
