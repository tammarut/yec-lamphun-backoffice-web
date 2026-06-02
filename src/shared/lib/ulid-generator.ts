import { ulid } from "ulid"
import type { IIdGenerator } from "src/modules/shared/session-store/session-store"

/**
 * ULID adapter implementing IIdGenerator interface
 */
export class UlidGenerator implements IIdGenerator {
	generate(): string {
		return ulid()
	}
}

// Export singleton instance
export const ulidGenerator = new UlidGenerator()
