/**
 * Interface for generating unique identifiers.
 *
 * Generic shared contract — not tied to session storage. Consumers inject an
 * implementation (e.g. ULID) via the `ID_GENERATOR` DI token.
 */
export interface IIdGenerator {
	generate(): string
}
