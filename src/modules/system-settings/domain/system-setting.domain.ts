/**
 * Represents a row from the `system_settings` table.
 * The `value` field is typed as `unknown` since JSONB can hold any structure.
 * Consumers should narrow the type based on the specific feature.
 */
export interface SystemSettingDomain {
	readonly feature: string
	readonly value: unknown
	readonly description: string | null
	readonly createdAt: Date
	readonly updatedAt: Date
}
