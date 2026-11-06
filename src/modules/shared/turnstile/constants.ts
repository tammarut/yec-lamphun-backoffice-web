/**
 * The Turnstile contract strings shared by BOTH sides of the gate (SEC-5/SEC-6,
 * ADR-0028): the request-header transport and the two canonical rejection
 * messages the frontend classifies on. Pure string constants — no server
 * imports — so client code can use them without pulling next/server or the
 * DI container into the bundle.
 */

/** The ONE transport for the guest human-verification token (ADR-0028): a request header on both public renewal-flow POSTs. */
export const TURNSTILE_TOKEN_HEADER = "Yec-Turnstile-Token"

/** The token itself failed verification (missing/invalid/expired) → the 403 family (server sends this exact wording). */
export const TURNSTILE_VERIFICATION_FAILED_MESSAGE = "Human verification failed"

/** Siteverify unreachable/timed-out/misconfigured → the retryable 503 family (server sends this exact wording). */
export const TURNSTILE_SERVICE_UNAVAILABLE_MESSAGE = "Human verification is temporarily unavailable"
