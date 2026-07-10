import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { Result, ResultAsync, err, ok } from "neverthrow"
import { REGISTER_KEY } from "src/modules/di-tokens"
import type { EnvConfig } from "src/shared/config/env"
import { inject, singleton } from "tsyringe"
import { StorageError } from "./errors"
import type { BucketKind, IStorageClient, PutObjectParams } from "./storage-client.interface"

/**
 * Cloudflare R2 storage client, S3-compatible API.
 *
 * Endpoint is derived from R2_ACCOUNT_ID: https://<account>.r2.cloudflarestorage.com
 * Credentials (R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY) and bucket names are
 * injected via {@link EnvConfig}, mirroring the AuthService pattern — the client
 * never imports the config singleton directly.
 *
 * The token must be scoped to both R2_PUBLIC_BUCKET and R2_PRIVATE_BUCKET with
 * Object Read & Write. See docs/adr/0002-r2-two-bucket-public-private-split.md.
 */
@singleton()
export class R2StorageClient implements IStorageClient {
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
}
