"use client"

import { useMutation, useQuery, useQueryClient, type UseMutationResult } from "@tanstack/react-query"
import { createContext, useContext, type ReactNode } from "react"

import { ApiError, fetchJson } from "src/shared/lib/api/fetch-json"

export const SESSION_QUERY_KEY = ["auth", "session"] as const

export type LoginInput = {
	username: string
	password: string
}

async function fetchSession(): Promise<boolean> {
	const result = await fetchJson<null>("/api/v1/auth/session")
	if (result.isErr()) throw result.error
	return true
}

async function login(input: LoginInput): Promise<void> {
	const result = await fetchJson<null>("/api/v1/auth/login", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(input),
	})
	if (result.isErr()) throw result.error
}

async function logout(): Promise<void> {
	const result = await fetchJson<null>("/api/v1/auth/logout", { method: "POST" })
	if (result.isErr()) throw result.error
}

type SessionContextValue = {
	/** True only when the session cookie is valid — the single isAdmin source for every page. */
	isAdmin: boolean
	/** True while the initial session check is in flight; admin controls stay disabled meanwhile. */
	isCheckingSession: boolean
	loginMutation: UseMutationResult<void, ApiError, LoginInput>
	logoutMutation: UseMutationResult<void, ApiError, void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
	const queryClient = useQueryClient()

	const sessionQuery = useQuery({
		queryKey: SESSION_QUERY_KEY,
		queryFn: fetchSession,
		staleTime: 30_000,
		retry: false,
	})

	const loginMutation = useMutation<void, ApiError, LoginInput>({
		mutationFn: login,
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY })
		},
	})

	const logoutMutation = useMutation<void, ApiError, void>({
		mutationFn: logout,
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY })
		},
	})

	return (
		<SessionContext.Provider
			value={{
				isAdmin: sessionQuery.data === true,
				isCheckingSession: sessionQuery.isPending,
				loginMutation,
				logoutMutation,
			}}
		>
			{children}
		</SessionContext.Provider>
	)
}

export function useSession(): SessionContextValue {
	const context = useContext(SessionContext)
	if (!context) {
		throw new Error("useSession must be used within a SessionProvider")
	}
	return context
}
