import { type Result, ResultAsync, err, ok } from "neverthrow"
import { REGISTER_KEY } from "src/modules/di-tokens"
import type { IStorageUrlResolver } from "src/modules/shared/storage"
import { StorageError } from "src/modules/shared/storage"
import { inject, singleton } from "tsyringe"
import type { MemberFilePaths, MemberFileUrls } from "./member-file-url.types"

/**
 * Member-side URL policy: maps each file-bearing response field to its bucket
 * kind, then delegates URL minting to {@link IStorageUrlResolver}. This is the
 * only place that knows which member fields are public vs private — the bucket
 * choice is member-domain policy, while presigning/concatenating is generic
 * storage capability (ADR-0007).
 *
 * Two resolution modes, run separately because their failure profiles differ:
 *   - **Public** fields (`profile_avatar`, `logo`, `product`): pure string concat
 *     via `resolver.publicUrl` — synchronous and infallible, resolved inline.
 *   - **Private** fields (`id_card_image`, `company_certificate`): network-bound
 *     presigning via `resolver.presign` — run in parallel via `ResultAsync.combine`.
 *
 * **Failure policy:** a presign failure is an *infra-level* failure (R2
 * unreachable, bad creds, clock skew) — systemic, not per-field — so it
 * propagates as `err(StorageError)` and the route maps it to 500. This is
 * distinct from the `id_card_no` decrypt failure (data-level, per-row), which
 * degrades to `null` + 200 (ADR-0008). A 200-with-null-URLs would silently lie
 * ("member has no documents") when the truth is "storage is down"; a 500 is
 * honest and actionable. Null paths (a field with no uploaded file) pass
 * through as `null` URLs without calling the resolver — absence is not failure.
 */
@singleton()
export class MemberFileUrlService {
	constructor(@inject(REGISTER_KEY.STORAGE_URL_RESOLVER) private readonly resolver: IStorageUrlResolver) {}

	/**
	 * Resolve a single `profile_avatar` path to its public URL (ADR-0007).
	 *
	 * Purpose-built for the list view, which resolves only this one public
	 * field per row — distinct from {@link resolveMemberFileUrls} (5 mixed
	 * public/private fields, the detail view). Sync and infallible: public
	 * concat has no failure mode, so the return is a plain `string | null`
	 * (no `Result` wrapper — a `Result` would lie about a failure mode that
	 * cannot happen, mirroring the rationale for `IStorageUrlResolver.publicUrl`
	 * returning a bare string). Null path → null URL; absence is not failure.
	 *
	 * Routing the list through this method (rather than calling
	 * `resolver.publicUrl` directly from the list service) keeps the
	 * "profile_avatar is public" assertion in the member-side policy service,
	 * where ADR-0007 centralized it.
	 */
	resolveProfileAvatarUrl(path: string | null): string | null {
		return this.resolvePublic(path)
	}

	/**
	 * Resolve all five file fields to URLs. Public fields synchronously, private
	 * fields in parallel. A presign failure short-circuits the combine and
	 * returns `err`; public URL concat is infallible.
	 */
	async resolveMemberFileUrls(paths: MemberFilePaths): Promise<Result<MemberFileUrls, StorageError>> {
		// Public fields — synchronous concat, infallible. Null paths pass through.
		const profileAvatar = this.resolvePublic(paths.profileAvatar)
		const logo = this.resolvePublic(paths.logo)
		const product = this.resolvePublic(paths.product)

		// Private fields — parallel presigning. combine short-circuits on the first
		// err (a presign failure is systemic, so failing fast is correct). Null
		// paths short-circuit to ok(null) without touching the network.
		const privateResult = await ResultAsync.combine([this.resolvePrivate(paths.idCardImage), this.resolvePrivate(paths.companyCertificate)])
		if (privateResult.isErr()) {
			return err(privateResult.error)
		}
		const [idCardImage, companyCertificate] = privateResult.value

		return ok({ idCardImage, companyCertificate, profileAvatar, logo, product })
	}

	/**
	 * Private-bucket object → presigned URL, or null for a null path. Propagates
	 * presign failures as `err(StorageError)` — they are infra-level, not per-field.
	 */
	private resolvePrivate(path: string | null): ResultAsync<string | null, StorageError> {
		if (path === null) {
			return ResultAsync.fromSafePromise(Promise.resolve(null))
		}
		return ResultAsync.fromPromise(this.resolver.presign(path), (e) => e as StorageError).andThen((r) => (r.isErr() ? err(r.error) : ok(r.value)))
	}

	/** Public-bucket object → concatenated URL, or null on null-path. Infallible. */
	private resolvePublic(path: string | null): string | null {
		if (path === null) {
			return null
		}
		return this.resolver.publicUrl(path)
	}
}
