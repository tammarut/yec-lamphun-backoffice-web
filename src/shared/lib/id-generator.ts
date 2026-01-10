import { ulid } from "ulid"
import type { IIdGenerator } from "src/modules/auth/interfaces"

/**
 * ULID adapter implementing IIdGenerator interface
 */
export class UlidGenerator implements IIdGenerator {
	generate(): string {
		return ulid()
	}
}

// Export singleton instance
export const idGenerator = new UlidGenerator()
