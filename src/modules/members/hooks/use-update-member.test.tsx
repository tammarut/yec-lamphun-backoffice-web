import { afterEach, describe, expect, test, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

import { useUpdateMember } from "src/modules/members/hooks/use-update-member"
import type { MemberWizardFormValues } from "src/modules/members/schemas/member-wizard-schema"

// jsdom is fine here despite the File/FormData use: fetch is fully stubbed, so
// no Blob.arrayBuffer() call and no cross-realm undici boundary is involved.

function jsonResponse(status: number, body?: unknown): Response {
	return new Response(body === undefined ? null : JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

/** A representative EDIT-mode form: pre-filled pairs with one changed file, blank id_card_no. */
function makeValues(): MemberWizardFormValues {
	return {
		registration_type: "INDIVIDUAL",
		company_certificate: { file: null, existingUrl: "https://presigned/cert.jpg" },
		id_card_image: { file: new File(["id"], "id.png", { type: "image/png" }), existingUrl: null },
		profile_avatar: { file: null, existingUrl: "https://public/av.png" },
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
		id_card_no: "",
		id_card_expiry_date: "2035-01-01",
		phone_no: "081-234-5678",
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
			logo: { file: null, existingUrl: "https://public/logo.png" },
			product: { file: null, existingUrl: null },
		},
	}
}

function renderUpdateHook() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	const invalidateSpy = vi.spyOn(client, "invalidateQueries")
	const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
	return { ...renderHook(() => useUpdateMember(), { wrapper }), invalidateSpy, client }
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe("useUpdateMember", () => {
	describe("Happy cases", () => {
		test("uploads only CHANGED files, then PATCHes with null id_card_no and null unchanged paths", async () => {
			const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input)
				if (url === "/api/v1/members/file/upload") {
					expect(init?.method).toBe("POST")
					const form = init?.body as FormData
					expect(form.get("id_card_image")).toBeInstanceOf(File)
					expect(form.has("company_certificate")).toBe(false)
					expect(form.has("profile_avatar")).toBe(false)
					expect(form.has("business_logo")).toBe(false)
					return jsonResponse(200, {
						id_card_image_file_path: "members/documents/id_card_image_X.png",
						company_certificate_file_path: null,
						profile_avatar_file_path: null,
						business_logo_file_path: null,
						business_product_file_path: null,
						payment_slip_file_path: null,
					})
				}
				if (url === "/api/v1/members/42") {
					expect(init?.method).toBe("PATCH")
					const body = JSON.parse(String(init?.body)) as Record<string, unknown>
					// Blank id card → null (null-sticky keep), NOT the masked value.
					expect(body["id_card_no"]).toBeNull()
					// Changed file → uploaded path; unchanged files → null (sticky keep).
					expect(body["id_card_image"]).toBe("members/documents/id_card_image_X.png")
					expect(body["company_certificate"]).toBeNull()
					expect(body["profile_avatar"]).toBeNull()
					expect(body["business"]).toMatchObject({ logo: null, product: null })
					return new Response(null, { status: 204 })
				}
				return jsonResponse(404, { error_message: `unexpected url ${url}` })
			})
			vi.stubGlobal("fetch", fetchMock)

			const { result } = renderUpdateHook()
			result.current.mutate({ id: 42, values: makeValues() })
			await waitFor(() => expect(result.current.isSuccess).toBe(true))
			expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/v1/members/file/upload")).toHaveLength(1)
			expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/v1/members/42")).toHaveLength(1)
		})

		test("skips the upload request entirely when no file changed", async () => {
			const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				if (String(input) === "/api/v1/members/42") {
					const body = JSON.parse(String(init?.body)) as Record<string, unknown>
					expect(body["id_card_image"]).toBeNull()
					return new Response(null, { status: 204 })
				}
				return jsonResponse(500, { error_message: `unexpected url ${String(input)}` })
			})
			vi.stubGlobal("fetch", fetchMock)

			const values = makeValues()
			values.id_card_image = { file: null, existingUrl: null }
			const { result } = renderUpdateHook()
			result.current.mutate({ id: 42, values })
			await waitFor(() => expect(result.current.isSuccess).toBe(true))
			expect(fetchMock).toHaveBeenCalledTimes(1)
		})

		test("invalidates (not resets) the list AND detail caches on success", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => new Response(null, { status: 204 }))
			)
			const values = makeValues()
			values.id_card_image = { file: null, existingUrl: null }
			const { result, invalidateSpy } = renderUpdateHook()
			result.current.mutate({ id: 42, values })
			await waitFor(() => expect(result.current.isSuccess).toBe(true))
			await waitFor(() => {
				expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["members", "list"] })
				expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["members", "detail", 42] })
			})
		})
	})

	describe("Unhappy cases", () => {
		test("surfaces the upload error and never PATCHes", async () => {
			const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
				if (String(input) === "/api/v1/members/file/upload") {
					return jsonResponse(400, { error_message: "File exceeds the 7MB limit" })
				}
				return new Response(null, { status: 204 })
			})
			vi.stubGlobal("fetch", fetchMock)

			const { result } = renderUpdateHook()
			result.current.mutate({ id: 42, values: makeValues() })
			await waitFor(() => expect(result.current.isError).toBe(true))
			expect(result.current.error?.message).toBe("File exceeds the 7MB limit")
			expect(fetchMock).toHaveBeenCalledTimes(1)
		})

		test("surfaces the PATCH 409 contact conflict with its server message", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => jsonResponse(409, { error_message: "A member with this phone number already exists" }))
			)
			const { result } = renderUpdateHook()
			result.current.mutate({ id: 42, values: makeValues() })
			await waitFor(() => expect(result.current.isError).toBe(true))
			expect(result.current.error?.status).toBe(409)
			expect(result.current.error?.message).toBe("A member with this phone number already exists")
		})
	})
})
