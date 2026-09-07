"use client"

import { useEffect, useState } from "react"

/**
 * Return `value`, delayed until it has been stable for `delayMs`.
 * Used to keep keystrokes off the server until typing pauses.
 * The initial value passes through immediately on mount (the first
 * request is not gated by the delay).
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
	const [debounced, setDebounced] = useState(value)

	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delayMs)
		return () => clearTimeout(timer)
	}, [value, delayMs])

	return debounced
}
