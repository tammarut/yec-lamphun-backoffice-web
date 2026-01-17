/**
 * Represents a row from the `system_settings` table.
 * The `value` field is typed as `unknown` since JSONB can hold any structure.
 * Consumers should narrow the type based on the specific feature.
 */
export interface SystemSettingDomain {
	feature: string
	value: unknown
	description: string | null
	createdAt: Date
	updatedAt: Date
}
