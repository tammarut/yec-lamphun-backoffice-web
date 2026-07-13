/**
 * Read models for the members domain.
 *
 * These are the typed shapes the repository returns to the service. They map
 * snake_case DB columns to camelCase TS fields (the conversion happens in the
 * repository, which adapts sqlc's generated rows). Pure data — no behavior.
 */

export type PositionCardinality = "SINGLE" | "MULTIPLE"

export interface PositionReadModel {
	readonly code: string
	readonly nameTh: string
	readonly nameEn: string
	readonly cardinality: PositionCardinality
	readonly parentPositionCode: string | null
	readonly displayOrder: number
	readonly isActive: boolean
}

/** The document types accepted by member_documents.type (CHECK constraint). */
export type MemberDocumentType = "ID_CARD" | "COMPANY_CERTIFICATE" | "PAYMENT_SLIP"
