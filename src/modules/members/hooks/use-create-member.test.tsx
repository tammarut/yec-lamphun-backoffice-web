import { afterEach, describe, expect, test, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

import { useCreateMember } from "src/modules/members/hooks/use-create-member"
import type { MemberWizardFormValues } from "src/modules/members/schemas/member-wizard-schema"

// jsdom is fine here despite the File/FormData use: fetch is fully stubbed, so
// no Blob.arrayBuffer() call and no cross-realm undici boundary is involved.

function jsonResponse(status: number, body?: unknown): Response {
	return new Response(body === undefined ? null : JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

function makeValues(): MemberWizardFormValues {
	return {
		registration_type: "INDIVIDUAL",
		company_certificate: { file: new File(["cert"], "cert.png", { type: "image/png" }), existingUrl: null },
		id_card_image: { file: null, existingUrl: null },
		profile_avatar: { file: new File(["av"], "avatar.webp", { type: "image/webp" }), existingUrl: null },
		title_name_th: "นาย",
		first_name_th: "สมชาย",
		last_name_th: "ใจดี",
		title_name_en: "",
		first_name_en: "",
		last_name_en: "",
		nickname: "ชาย",
		gender: "MALE",
		date_of_birth: "1990-06-15",
		nationality: "ไทย",
		id_card_no: "1234567890123",
		id_card_expiry_date: "2035-01-01",
		phone_no: "0812345678",
		email: "",
		line_id: "",
		shirt_size: "",
		position: "GENERAL_MEMBER",
		business: {
			name: "สมชาย คอนสตรัคชั่น",
			juristic_registration_no: "0505561000123",
			category_id: "2",
			address: "",
			latitude: "",
			longitude: "",
			description: "รับเหมาก่อสร้าง",
			core_business: "",
			website: "",
			logo: { file: null, existingUrl: null },
			product: { file: null, existingUrl: null },
		},
	}
}

function renderCreateHook() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	const resetSpy = vi.spyOn(client, "resetQueries")
	const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
	return { ...renderHook(() => useCreateMember(), { wrapper }), resetSpy, client }
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe("useCreateMember", () => {
	describe("Happy cases", () => {
		test("uploads selected files first, then POSTs the create payload with the returned paths", async () => {
			const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input)
				if (url === "/api/v1/members/file/upload") {
					expect(init?.method).toBe("POST")
					const form = init?.body as FormData
					expect(form.get("company_certificate")).toBeInstanceOf(File)
					expect(form.get("profile_avatar")).toBeInstanceOf(File)
					expect(form.has("id_card_image")).toBe(false)
					return jsonResponse(200, {
						id_card_image_file_path: null,
						company_certificate_file_path: "members/documents/company_cert_X.png",
						profile_avatar_file_path: "members/profile_avatars/profile_avatar_X.webp",
						business_logo_file_path: null,
						business_product_file_path: null,
						payment_slip_file_path: null,
					})
				}
				if (url === "/api/v1/members") {
					const body = JSON.parse(String(init?.body)) as Record<string, unknown>
					expect(body["company_certificate"]).toBe("members/documents/company_cert_X.png")
					expect(body["profile_avatar"]).toBe("members/profile_avatars/profile_avatar_X.webp")
					expect(body["id_card_image"]).toBeNull()
					expect(body["shirt_size"]).toBeUndefined()
					return jsonResponse(201, { id: 42 })
				}
				return jsonResponse(404, { error_message: `unexpected url ${url}` })
			})
			vi.stubGlobal("fetch", fetchMock)

			const { result } = renderCreateHook()
			result.current.mutate(makeValues())
			await waitFor(() => expect(result.current.data).toEqual({ id: 42 }))
			expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/v1/members/file/upload")).toHaveLength(1)
		})

		test("skips the upload request entirely when no file is selected", async () => {
			const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
				if (String(input) === "/api/v1/members") {
					return jsonResponse(201, { id: 7 })
				}
				return jsonResponse(500, { error_message: `unexpected url ${String(input)}` })
			})
			vi.stubGlobal("fetch", fetchMock)

			const values = makeValues()
			values.company_certificate = { file: null, existingUrl: null }
			values.profile_avatar = { file: null, existingUrl: null }

			const { result } = renderCreateHook()
			result.current.mutate(values)
			await waitFor(() => expect(result.current.data).toEqual({ id: 7 }))
			expect(fetchMock).toHaveBeenCalledTimes(1)
			expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/v1/members")
		})

		test("resets the members list cache on success (keyset-cursor contract)", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => jsonResponse(201, { id: 9 }))
			)
			const { result, resetSpy } = renderCreateHook()
			result.current.mutate(makeValues())
			await waitFor(() => expect(result.current.isSuccess).toBe(true))
			await waitFor(() => expect(resetSpy).toHaveBeenCalledWith({ queryKey: ["members", "list"] }))
		})
	})

	describe("Unhappy cases", () => {
		test("surfaces the upload error and never POSTs the create payload", async () => {
			const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
				if (String(input) === "/api/v1/members/file/upload") {
					return jsonResponse(400, { error_message: "File exceeds the 7MB limit" })
				}
				return jsonResponse(201, { id: 1 })
			})
			vi.stubGlobal("fetch", fetchMock)

			const { result } = renderCreateHook()
			result.current.mutate(makeValues())
			await waitFor(() => expect(result.current.isError).toBe(true))
			expect(result.current.error?.message).toBe("File exceeds the 7MB limit")
			expect(fetchMock).toHaveBeenCalledTimes(1)
		})

		test("surfaces the create 409 with its server message", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async (input: RequestInfo | URL) => {
					if (String(input) === "/api/v1/members/file/upload") {
						return jsonResponse(200, {
							id_card_image_file_path: null,
							company_certificate_file_path: "members/documents/company_cert_X.png",
							profile_avatar_file_path: null,
							business_logo_file_path: null,
							business_product_file_path: null,
							payment_slip_file_path: null,
						})
					}
					return jsonResponse(409, { error_message: "A member with this ID card already exists" })
				})
			)

			const { result } = renderCreateHook()
			result.current.mutate(makeValues())
			await waitFor(() => expect(result.current.isError).toBe(true))
			expect(result.current.error?.status).toBe(409)
		})
	})
})
