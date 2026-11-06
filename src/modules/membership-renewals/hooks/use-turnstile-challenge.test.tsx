import { afterEach, describe, expect, test, vi } from "vitest"
import { act, cleanup, render, type RenderResult } from "@testing-library/react"

import { useTurnstileChallenge, type TurnstileWidgetOptions, type UseTurnstileChallenge } from "src/modules/membership-renewals/hooks/use-turnstile-challenge"

/**
 * The hook renders the widget into a real DOM node (explicit rendering per the
 * Cloudflare flow), so the harness mounts a container div and captures the
 * hook API on every render for the assertions below.
 */
function ChallengeHarness(props: { siteKey: string; active: boolean; showContainer?: boolean; onRender: (challenge: UseTurnstileChallenge) => void }) {
	const challenge = useTurnstileChallenge({ siteKey: props.siteKey, active: props.active })
	const { attachContainer } = challenge
	props.onRender(challenge)
	if (props.showContainer === false) {
		return null
	}
	return <div ref={attachContainer} data-slot="turnstile-widget" />
}

/** onRender sink: keeps the latest hook API in a plain holder object for the assertions. */
function captureInto(holder: { current: UseTurnstileChallenge | null }) {
	return (challenge: UseTurnstileChallenge) => {
		holder.current = challenge
	}
}

type TurnstileRenderOptions = TurnstileWidgetOptions & { sitekey: string }

/** A window.turnstile stub capturing render invocations so tests can fire the callbacks. */
function stubTurnstile() {
	const rendered: { el: HTMLElement; options: TurnstileRenderOptions }[] = []
	const api = {
		render: vi.fn((el: HTMLElement, options: TurnstileRenderOptions) => {
			rendered.push({ el, options })
			return `widget-${rendered.length}`
		}),
		reset: vi.fn(),
		remove: vi.fn(),
	}
	vi.stubGlobal("turnstile", api)
	return { api: api, rendered: rendered }
}

function renderChallenge(siteKey = "site-key-123", active = true) {
	const latestRef: { current: UseTurnstileChallenge | null } = { current: null }
	const turnstile = stubTurnstile()
	const view: RenderResult = render(<ChallengeHarness siteKey={siteKey} active={active} onRender={captureInto(latestRef)} />)
	return { latestRef: latestRef, turnstile: turnstile, view: view }
}

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
})

describe("useTurnstileChallenge", () => {
	describe("Happy cases", () => {
		test("renders the widget into the container with the given site key once active", () => {
			// Arrange / Act
			const { turnstile } = renderChallenge()

			// Assert
			expect(turnstile.rendered).toHaveLength(1)
			expect(turnstile.rendered[0]?.options.sitekey).toBe("site-key-123")
		})

		test("arms the token when the widget fires the success callback", () => {
			// Arrange
			const { latestRef, turnstile } = renderChallenge()

			// Act
			act(() => {
				turnstile.rendered[0]?.options.callback?.("tok-1")
			})

			// Assert
			expect(latestRef.current?.token).toBe("tok-1")
		})

		test("waitForToken resolves immediately when a token is already armed", async () => {
			// Arrange
			const { latestRef, turnstile } = renderChallenge()
			act(() => {
				turnstile.rendered[0]?.options.callback?.("tok-armed")
			})

			// Act / Assert
			await expect(latestRef.current?.waitForToken()).resolves.toBe("tok-armed")
		})

		test("waitForToken resolves with the NEXT armed token when none is pending", async () => {
			// Arrange
			const { latestRef, turnstile } = renderChallenge()
			let pending: Promise<string> | null = null
			act(() => {
				pending = latestRef.current?.waitForToken() ?? null
			})

			// Act
			act(() => {
				turnstile.rendered[0]?.options.callback?.("tok-next")
			})

			// Assert
			await expect(pending).resolves.toBe("tok-next")
		})

		test("reset() delegates to turnstile.reset with the rendered widget id and clears the armed token", () => {
			// Arrange
			const { latestRef, turnstile } = renderChallenge()
			act(() => {
				turnstile.rendered[0]?.options.callback?.("tok-1")
			})

			// Act
			act(() => {
				latestRef.current?.reset()
			})

			// Assert
			expect(turnstile.api.reset).toHaveBeenCalledWith("widget-1")
			expect(latestRef.current?.token).toBeNull()
		})

		test("expired-callback clears the token so the submit guard re-locks (widget auto-refreshes)", () => {
			// Arrange
			const { latestRef, turnstile } = renderChallenge()
			act(() => {
				turnstile.rendered[0]?.options.callback?.("tok-1")
			})

			// Act
			act(() => {
				turnstile.rendered[0]?.options["expired-callback"]?.()
			})

			// Assert
			expect(latestRef.current?.token).toBeNull()
		})

		test("unmount removes the rendered widget exactly once (StrictMode-safe render/remove pairing)", () => {
			// Arrange
			const { turnstile, view } = renderChallenge()

			// Act
			view.unmount()

			// Assert
			expect(turnstile.api.remove).toHaveBeenCalledTimes(1)
			expect(turnstile.api.remove).toHaveBeenCalledWith("widget-1")
		})

		test("renders once the container attaches a commit late (a Radix dialog portal mounts its content after the body's effects run)", () => {
			// Arrange
			const latestRef: { current: UseTurnstileChallenge | null } = { current: null }
			const turnstile = stubTurnstile()
			const view = render(<ChallengeHarness siteKey="site-key-123" active={true} showContainer={false} onRender={captureInto(latestRef)} />)
			expect(turnstile.rendered).toHaveLength(0)

			// Act
			view.rerender(<ChallengeHarness siteKey="site-key-123" active={true} showContainer={true} onRender={captureInto(latestRef)} />)

			// Assert
			expect(turnstile.rendered).toHaveLength(1)
		})

		test("removes the widget when its container detaches while the hook stays mounted (the success panel replaces the form)", () => {
			// Arrange
			const latestRef: { current: UseTurnstileChallenge | null } = { current: null }
			const turnstile = stubTurnstile()
			const view = render(<ChallengeHarness siteKey="site-key-123" active={true} onRender={captureInto(latestRef)} />)

			// Act
			view.rerender(<ChallengeHarness siteKey="site-key-123" active={true} showContainer={false} onRender={captureInto(latestRef)} />)

			// Assert
			expect(turnstile.api.remove).toHaveBeenCalledWith("widget-1")
		})
	})

	describe("Unhappy cases", () => {
		test("does not render anything when active is false (admin mode / manual mode)", () => {
			// Arrange / Act
			const { turnstile } = renderChallenge("site-key-123", false)

			// Assert
			expect(turnstile.rendered).toHaveLength(0)
		})

		test("does not render anything when the site key is empty (unconfigured deployment)", () => {
			// Arrange / Act
			const { turnstile } = renderChallenge("")

			// Assert
			expect(turnstile.rendered).toHaveLength(0)
		})

		test("error-callback flags the challenge as failed", () => {
			// Arrange
			const { latestRef, turnstile } = renderChallenge()

			// Act
			act(() => {
				turnstile.rendered[0]?.options["error-callback"]?.("300030")
			})

			// Assert
			expect(latestRef.current?.failed).toBe(true)
		})

		test("a fresh token clears the failed flag (the widget's auto-retry recovered)", () => {
			// Arrange
			const { latestRef, turnstile } = renderChallenge()
			act(() => {
				turnstile.rendered[0]?.options["error-callback"]?.("300030")
			})

			// Act
			act(() => {
				turnstile.rendered[0]?.options.callback?.("tok-recovered")
			})

			// Assert
			expect(latestRef.current?.failed).toBe(false)
			expect(latestRef.current?.token).toBe("tok-recovered")
		})

		test("a blocked Turnstile script (ad blocker / network) flags the challenge as failed", async () => {
			// Arrange — no window.turnstile, so the hook injects the real script tag.
			vi.stubGlobal("turnstile", undefined)
			const latestRef: { current: UseTurnstileChallenge | null } = { current: null }
			render(<ChallengeHarness siteKey="site-key-123" active={true} onRender={captureInto(latestRef)} />)
			const script = document.head.querySelector<HTMLScriptElement>('script[src^="https://challenges.cloudflare.com/turnstile/"]')

			// Act
			await act(async () => {
				script?.dispatchEvent(new Event("error"))
			})

			// Assert
			expect(script).not.toBeNull()
			expect(latestRef.current?.failed).toBe(true)
			script?.remove()
		})

		test("error-callback clears the token and rejects a pending waitForToken", async () => {
			// Arrange
			const { latestRef, turnstile } = renderChallenge()
			let pending: Promise<string> | null = null
			act(() => {
				pending = latestRef.current?.waitForToken() ?? null
			})

			// Act
			act(() => {
				turnstile.rendered[0]?.options["error-callback"]?.("300---")
			})

			// Assert
			expect(latestRef.current?.token).toBeNull()
			await expect(pending).rejects.toThrow()
		})

		test("unmount rejects a pending waitForToken so an in-flight dialog flow never ghost-submits", async () => {
			// Arrange
			const { latestRef, view } = renderChallenge()
			let pending: Promise<string> | null = null
			act(() => {
				pending = latestRef.current?.waitForToken() ?? null
			})

			// Act
			view.unmount()

			// Assert
			await expect(pending).rejects.toThrow()
		})
	})
})
