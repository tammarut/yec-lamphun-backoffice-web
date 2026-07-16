import { MemberValidationError } from "./errors"
import type { Result } from "neverthrow"
import { err, ok } from "neverthrow"

/**
 * The business record associated with a member (1:1).
 *
 * Owns the location invariant: the client sends [lat, long], but the DB column
 * stores [long, lat] (X=longitude, Y=latitude convention). This VO performs the
 * swap at construction time so callers never think about coordinate order again.
 * Location is optional (spec: not in business required list); when provided,
 * it must be a [lat, long] pair.
 *
 * Constructed exclusively through {@link create}; fromDb trusts persisted data.
 */
export class MemberBusiness {
	private constructor(
		private readonly _name: string,
		private readonly _description: string,
		private readonly _juristicRegistrationNo: string,
		private readonly _categoryId: number,
		private readonly _address: string | null,
		private readonly _location: readonly [number, number] | null,
		private readonly _coreBusiness: string | null,
		private readonly _website: string | null,
		private readonly _logoFilePath: string | null,
		private readonly _productFilePath: string | null
	) {}

	static create(input: {
		name: string
		description: string
		juristicRegistrationNo: string
		categoryId: number
		address: string | null
		location: readonly [number, number] | null
		coreBusiness: string | null
		website: string | null
		logo: string | null
		product: string | null
	}): Result<MemberBusiness, MemberValidationError> {
		if (!input.name.trim()) {
			return err(new MemberValidationError("business.name is required"))
		}
		if (!input.juristicRegistrationNo.trim()) {
			return err(new MemberValidationError("business.juristic_registration_no is required"))
		}
		// Swap [lat, long] → [long, lat] for the DB column convention; null passes through.
		const swapped = input.location ? swapLatLong(input.location) : null
		return ok(
			new MemberBusiness(
				input.name.trim(),
				input.description,
				input.juristicRegistrationNo.trim(),
				input.categoryId,
				input.address,
				swapped,
				input.coreBusiness,
				input.website,
				input.logo,
				input.product
			)
		)
	}

	/** Trust persisted data (already in [long, lat] order or null). Used by Repository. */
	static fromDb(props: {
		name: string
		description: string
		juristicRegistrationNo: string
		categoryId: number
		address: string | null
		location: readonly [number, number] | null
		coreBusiness: string | null
		website: string | null
		logoFilePath: string | null
		productFilePath: string | null
	}): MemberBusiness {
		return new MemberBusiness(
			props.name,
			props.description,
			props.juristicRegistrationNo,
			props.categoryId,
			props.address,
			props.location,
			props.coreBusiness,
			props.website,
			props.logoFilePath,
			props.productFilePath
		)
	}

	get name() {
		return this._name
	}
	get description() {
		return this._description
	}
	get juristicRegistrationNo() {
		return this._juristicRegistrationNo
	}
	get categoryId() {
		return this._categoryId
	}
	get address() {
		return this._address
	}
	/** Location in DB convention: [longitude, latitude], or null if not provided. */
	get location(): readonly [number, number] | null {
		return this._location
	}
	get coreBusiness() {
		return this._coreBusiness
	}
	get website() {
		return this._website
	}
	get logoFilePath() {
		return this._logoFilePath
	}
	get productFilePath() {
		return this._productFilePath
	}
}

/** Swap a [lat, long] pair to [long, lat]. */
function swapLatLong([lat, long]: readonly [number, number]): readonly [number, number] {
	return [long, lat]
}
