import type { IIdGenerator } from "src/modules/shared/id-generator"

/**
 * UUIDv7 adapter implementing the IIdGenerator interface (ADR-0026).
 *
 * Time-ordered like ULID, but native-uuid shaped: the Renewal Group marker
 * column is a Postgres `uuid`, so the minted string must be a valid UUID.
 * Minted by Bun's built-in `randomUUIDv7` — zero dependencies. The existing
 * ULID binding (session ids, member file paths) is untouched: this generator
 * registers under its own DI token (`UUID_ID_GENERATOR`).
 *
 * Runtime note: the `Bun` global exists everywhere the app runs (dev/start use
 * `bun --bun`, the Docker runner CMD is `bun server.js`) AND under vitest —
 * whose scripts are pinned to `bunx --bun vitest` for exactly this reason
 * (plain vitest executes under Node, where `Bun` is undefined).
 */
export class UuidV7Generator implements IIdGenerator {
	generate(): string {
		return Bun.randomUUIDv7()
	}
}

// Export singleton instance
export const uuidV7Generator = new UuidV7Generator()
