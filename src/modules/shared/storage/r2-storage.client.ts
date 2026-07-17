import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { type Result, ResultAsync, err, ok } from "neverthrow"
import { REGISTER_KEY } from "src/modules/di-tokens"
import type { EnvConfig } from "src/shared/config/env"
import { inject, singleton } from "tsyringe"
import { StorageError } from "./errors"
import type { BucketKind, IStorageClient, PutObjectParams } from "./storage-client.interface"
import type { IStorageUrlResolver } from "./storage-url-resolver.interface"

/**
 * Cloudflare R2 storage adapter (S3-compatible API).
 *
 * Implements BOTH {@link IStorageClient} (write: `putObject`, `getBucketName`)
 * and {@link IStorageUrlResolver} (URL minting: `presign`, `publicUrl`). One
 * class owns one {@link S3Client} instance — one TCP connection pool to R2 —
 * instead of two singletons with duplicated config. The two interfaces stay
 * separate (SRP at the interface level) so callers depend on the narrow seam
 * they need; the *adapter* is unified because it's the same external system.
 *
 * Config is injected via {@link EnvConfig} (`@inject(REGISTER_KEY.ENV_CONFIG)`),
 * mirroring the AuthService pattern — the client never imports the config
 * singleton directly. The R2 token must be scoped to both R2_PUBLIC_BUCKET and
 * R2_PRIVATE_BUCKET with Object Read & Write. See
 * docs/adr/0002-r2-two-bucket-public-private-split.md and
 * docs/adr/0007-file-url-resolution-via-dedicated-resolver-and-policy-service.md.
 */
@singleton()
export class R2StorageClient implements IStorageClient, IStorageUrlResolver {
	private readonly config: EnvConfig
	private readonly client: S3Client

	constructor(@inject(REGISTER_KEY.ENV_CONFIG) config: EnvConfig) {
		this.config = config
		const endpoint = `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
		this.client = new S3Client({
			region: "auto",
			endpoint: endpoint,
			credentials: {
				accessKeyId: config.R2_ACCESS_KEY_ID,
				secretAccessKey: config.R2_SECRET_ACCESS_KEY,
			},
		})
	}

	// --- IStorageClient (write) --------------------------------------------

	getBucketName(kind: BucketKind): string {
		return kind === "public" ? this.config.R2_PUBLIC_BUCKET : this.config.R2_PRIVATE_BUCKET
	}

	async putObject(params: PutObjectParams): Promise<Result<void, StorageError>> {
		const { bucket, key, body, contentType } = params

		const command = new PutObjectCommand({
			Bucket: bucket,
			Key: key,
			Body: body,
			ContentType: contentType,
		})
		const sendResult = await ResultAsync.fromPromise(this.client.send(command), (err) => err as Error)
		if (sendResult.isErr()) {
			const error = sendResult.error
			return err(new StorageError(`R2 PutObject failed for "${bucket}/${key}"`, error))
		}

		return ok(undefined)
	}

	// --- IStorageUrlResolver (URL minting) ---------------------------------

	publicUrl(key: string): string {
		// ponytail: trim duplicate slashes between base URL and key to stay robust
		// to a trailing slash in R2_PUBLIC_BASE_URL; cheap correctness. Pure concat
		// — infallible, so no Result wrapper.
		const base = this.config.R2_PUBLIC_BASE_URL.replace(/\/+$/, "")
		const cleanKey = key.replace(/^\/+/, "")
		return `${base}/${cleanKey}`
	}

	async presign(key: string) {
		const command = new GetObjectCommand({
			Bucket: this.config.R2_PRIVATE_BUCKET,
			Key: key,
		})
		// Cast through unknown: @aws-sdk/s3-request-presigner resolves its own
		// (patch-newer) @smithy/types copy, so TS sees both the S3Client and the
		// GetObjectCommand middlewareStacks as incompatible with the signer's
		// expected types. Structurally identical at runtime — known SDK type-drift.
		const sign = getSignedUrl as unknown as (client: unknown, command: unknown, opts: { expiresIn: number }) => Promise<string>
		const signedResult = await ResultAsync.fromPromise(sign(this.client, command, { expiresIn: this.config.PRESIGNED_URL_EXPIRES_IN }), (err) => err as Error)
		if (signedResult.isErr()) {
			return err(new StorageError(`R2 presign failed for "${key}"`, signedResult.error))
		}
		return ok(signedResult.value)
	}
}
