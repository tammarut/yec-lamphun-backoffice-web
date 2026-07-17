import type { Result } from "neverthrow"
import type { StorageError } from "./errors"

/**
 * Generic URL-resolution seam for object storage.
 *
 * Complements {@link IStorageClient} (write): this interface turns stored object
 * keys into URLs a browser can fetch. Public-bucket objects get a permanent URL
 * (pure string concat — no failure mode, so it returns a plain `string`);
 * private-bucket objects get a short-lived presigned URL (server-mediated,
 * network-bound — returns `Result`). Kept free of any member-domain vocabulary
 * so other modules can reuse it.
 *
 * See docs/adr/0007-file-url-resolution-via-dedicated-resolver-and-policy-service.md.
 */
export interface IStorageUrlResolver {
	/**
	 * Mint a time-limited, signed URL for a private-bucket object.
	 * Async because it calls the storage SDK's signer; can fail (network, auth).
	 */
	presign(key: string): Promise<Result<string, StorageError>>
	/**
	 * Build a permanent, non-signed URL for a public-bucket object by
	 * concatenating the configured base URL with the key. Pure and synchronous;
	 * infallible, so it returns a plain string (no Result wrapper).
	 */
	publicUrl(key: string): string
}
