import type { MemberDocumentType } from "./member-read-models"

/**
 * A document attached to a member (ID card image, company certificate, etc.).
 *
 * A simple value object: a type tag + a file path reference. Constructed via
 * {@link create}; fromDb trusts persisted data.
 */
export class MemberDocument {
	private constructor(
		private readonly _type: MemberDocumentType,
		private readonly _filePath: string
	) {}

	static create(type: MemberDocumentType, filePath: string): MemberDocument {
		return new MemberDocument(type, filePath)
	}

	static fromDb(type: MemberDocumentType, filePath: string): MemberDocument {
		return new MemberDocument(type, filePath)
	}

	get type() {
		return this._type
	}
	get filePath() {
		return this._filePath
	}
}
