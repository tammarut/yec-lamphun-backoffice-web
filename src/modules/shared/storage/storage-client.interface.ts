import type { ResultAsync } from "neverthrow"
import type { StorageError } from "./errors"

/** Which R2 bucket a field is stored in. */
export type BucketKind = "public" | "private"

/** Parameters for a single object upload. */
export interface PutObjectParams {
	readonly bucket: string
	readonly key: string
	readonly body: Buffer
	readonly contentType: string
}

/**
 * Generic object-storage seam. The real implementation talks to Cloudflare
 * R2 via the S3-compatible API; tests inject a mock of this interface.
 *
 * Kept free of any member-domain vocabulary so other modules can reuse it.
 */
export interface IStorageClient {
	/** Upload a single object. Resolves ok on success, err on failure. */
	putObject(params: PutObjectParams): Promise<ResultAsync<void, StorageError>>
	/** Resolve a logical bucket kind to its physical bucket name. */
	getBucketName(kind: BucketKind): string
}
