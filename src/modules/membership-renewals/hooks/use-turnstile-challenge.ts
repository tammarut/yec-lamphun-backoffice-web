"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/** Explicit rendering (Cloudflare existing-widget flow): we keep the widget id so the dialog can reset() between its two guarded calls. */
const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

export type TurnstileWidgetOptions = {
	callback?: (token: string) => void
	"expired-callback"?: () => void
	"error-callback"?: (errorCode?: string) => void
}

type TurnstileApi = {
	render: (container: HTMLElement, options: TurnstileWidgetOptions & { sitekey: string }) => string | undefined
	reset: (widgetId: string) => void
	remove: (widgetId: string) => void
}

declare global {
	interface Window {
		turnstile?: TurnstileApi
	}
}

type TokenWaiter = {
	resolve: (token: string) => void
	reject: (reason: Error) => void
}

export type UseTurnstileChallenge = {
	/** Pass as `ref` on the div the widget renders into — a state setter, not a ref object (a Radix portal attaches it a commit late). */
	attachContainer: (element: HTMLDivElement | null) => void
	/** The armed, unspent token — null while the challenge runs, after reset(), or after expiry. */
	token: string | null
	/** The widget broke (script blocked, or a challenge error) and has not issued a token since. */
	failed: boolean
	/** Spend the armed token: clears it and re-runs the challenge (tokens are single-use). */
	reset: () => void
	/** The armed token, or the next one the widget issues; rejects on widget error or unmount. */
	waitForToken: () => Promise<string>
}

let scriptLoad: Promise<TurnstileApi> | null = null

/** Injects the Turnstile script once per page; a failed load clears the memo so the next mount retries. */
function loadTurnstileScript(): Promise<TurnstileApi> {
	if (scriptLoad === null) {
		scriptLoad = new Promise<TurnstileApi>((resolve, reject) => {
			const script = document.createElement("script")
			script.src = TURNSTILE_SCRIPT_SRC
			script.async = true
			script.onload = () => {
				if (window.turnstile === undefined) {
					// e.g. a captive portal answering the script URL with its own page: let the next mount retry.
					scriptLoad = null
					reject(new Error("Turnstile script loaded without window.turnstile"))
					return
				}
				resolve(window.turnstile)
			}
			script.onerror = () => {
				scriptLoad = null
				reject(new Error("Turnstile script failed to load"))
			}
			document.head.appendChild(script)
		})
	}
	return scriptLoad
}

/**
 * The renewal dialog's human-verification token lifecycle (SEC-6, #130): the
 * widget renders while `active`, its token arms the submit, the dialog
 * reset()s after each guarded request (single-use), and waitForToken() bridges
 * the upload → submit gap while the re-armed challenge runs. Expiry clears the
 * token and the widget's default auto-refresh re-arms it.
 */
export function useTurnstileChallenge({ siteKey, active }: { siteKey: string; active: boolean }): UseTurnstileChallenge {
	// State, not a RefObject: the effect must re-run when the container attaches
	// (Radix portals mount content one commit after the dialog body) or detaches.
	const [container, setContainer] = useState<HTMLDivElement | null>(null)
	const widgetIdRef = useRef<string | null>(null)
	const tokenRef = useRef<string | null>(null)
	const waitersRef = useRef<TokenWaiter[]>([])
	const [token, setToken] = useState<string | null>(null)
	const [failed, setFailed] = useState(false)

	const armToken = useCallback((next: string | null) => {
		tokenRef.current = next
		setToken(next)
	}, [])

	const settleWaiters = useCallback((outcome: { token: string } | { error: Error }) => {
		const waiters = waitersRef.current
		waitersRef.current = []
		for (const waiter of waiters) {
			if ("token" in outcome) {
				waiter.resolve(outcome.token)
			} else {
				waiter.reject(outcome.error)
			}
		}
	}, [])

	useEffect(() => {
		if (!active || siteKey === "" || container === null) {
			return
		}
		let cancelled = false
		const mount = (turnstile: TurnstileApi) => {
			if (cancelled) {
				return
			}
			const widgetId = turnstile.render(container, {
				sitekey: siteKey,
				callback: (nextToken: string) => {
					armToken(nextToken)
					setFailed(false)
					settleWaiters({ token: nextToken })
				},
				"expired-callback": () => {
					armToken(null)
				},
				"error-callback": () => {
					armToken(null)
					setFailed(true)
					settleWaiters({ error: new Error("Turnstile challenge failed") })
				},
			})
			widgetIdRef.current = widgetId ?? null
		}
		if (window.turnstile !== undefined) {
			mount(window.turnstile)
		} else {
			loadTurnstileScript().then(mount, () => {
				if (!cancelled) {
					setFailed(true)
				}
			})
		}
		return () => {
			cancelled = true
			const widgetId = widgetIdRef.current
			widgetIdRef.current = null
			tokenRef.current = null
			if (widgetId !== null) {
				window.turnstile?.remove(widgetId)
			}
			settleWaiters({ error: new Error("Turnstile challenge unmounted") })
		}
	}, [active, siteKey, container, armToken, settleWaiters])

	const reset = useCallback(() => {
		armToken(null)
		const widgetId = widgetIdRef.current
		if (widgetId !== null) {
			window.turnstile?.reset(widgetId)
		}
	}, [armToken])

	const waitForToken = useCallback((): Promise<string> => {
		const armed = tokenRef.current
		if (armed !== null) {
			return Promise.resolve(armed)
		}
		return new Promise<string>((resolve, reject) => {
			waitersRef.current.push({ resolve: resolve, reject: reject })
		})
	}, [])

	return { attachContainer: setContainer, token: token, failed: failed, reset: reset, waitForToken: waitForToken }
}
