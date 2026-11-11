import { createHash, timingSafeEqual } from "node:crypto"

/**
 * Length-normalized constant-time string compare (SEC-3, #127): both sides are
 * digested to fixed-length SHA-256 first, so `timingSafeEqual`'s equal-length
 * requirement is met without leaking the plaintext lengths through an
 * exception path, and the comparison cost no longer scales with where the
 * first differing byte sits.
 *
 * Generic crypto utility — lives here, not in the auth module (scrutiny NIT-3,
 * #138), because nothing about it is auth-specific. Consumers: the login
 * credential compare (AuthService) and the turnstile gate's test-bypass
 * compare (#138).
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
	const digestA = createHash("sha256").update(a, "utf8").digest()
	const digestB = createHash("sha256").update(b, "utf8").digest()
	return timingSafeEqual(digestA, digestB)
}
