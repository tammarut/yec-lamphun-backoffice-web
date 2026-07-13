import { createHmac } from "node:crypto"
import { err, ok, type Result } from "neverthrow"
import { REGISTER_KEY } from "src/modules/di-tokens"
import type { EnvConfig } from "src/shared/config/env"
import { inject, singleton } from "tsyringe"
import { CryptoError } from "./errors"
import type { IBlindIndexService } from "./crypto-services.interface"

/**
 * HMAC-SHA256 blind-index adapter.
 *
 * Produces a 64-char hex digest. The key comes from
 * `EnvConfig.BLIND_INDEX_HMAC_KEY` — a hex string (`openssl rand -hex 32`,
 * 64 chars / 32 bytes) for consistency with {@link AesGcmEncryptionService}.
 * Never imports the config singleton directly; takes {@link EnvConfig} via
 * injection so it stays testable with a synthetic key.
 *
 * Deterministic: the same plaintext always yields the same digest, so it can
 * back a unique index / equality lookup without storing the plaintext.
 */
@singleton()
export class HmacBlindIndexService implements IBlindIndexService {
	private readonly key: Buffer

	constructor(@inject(REGISTER_KEY.ENV_CONFIG) config: EnvConfig) {
		// HMAC doesn't care about the byte *meaning*, only consistency. Decode as
		// hex so both PII keys follow the same env-var convention (hex, not utf8).
		this.key = Buffer.from(config.BLIND_INDEX_HMAC_KEY, "hex")
		if (this.key.length < 32) {
			throw new Error(
				`BLIND_INDEX_HMAC_KEY must decode to at least 32 bytes, got ${this.key.length}. ` + "Store it as a hex-encoded 32-byte string (e.g. `openssl rand -hex 32`)."
			)
		}
	}

	hash(plaintext: string): Result<string, CryptoError> {
		try {
			const hmac = createHmac("sha256", this.key)
			hmac.update(plaintext, "utf8")
			return ok(hmac.digest("hex"))
		} catch (error) {
			return err(new CryptoError("HMAC-SHA256 hashing failed", error))
		}
	}
}
