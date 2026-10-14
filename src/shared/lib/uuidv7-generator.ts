import { v7 } from "uuid"
import type { IIdGenerator } from "src/modules/shared/id-generator"

/**
 * UUIDv7 adapter implementing the IIdGenerator interface (ADR-0026).
 *
 * Time-ordered like ULID, but native-uuid shaped: the Renewal Group marker
 * column is a Postgres `uuid`, so the minted string must be a valid UUID. The
 * existing ULID binding (session ids, member file paths) is untouched — this
 * generator registers under its own DI token (`UUID_ID_GENERATOR`).
 */
export class UuidV7Generator implements IIdGenerator {
	generate(): string {
		return v7()
	}
}

// Export singleton instance
export const uuidV7Generator = new UuidV7Generator()
