// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest"

import { clearMemberFormDraft, readMemberFormDraft, restoreMemberFormDraft, saveMemberFormDraft } from "src/modules/members/components/member-form-draft"
import { MEMBER_WIZARD_DEFAULT_VALUES } from "src/modules/members/schemas/member-wizard-schema"

/** Minimal in-memory localStorage stand-in for the node environment. */
function installMemoryLocalStorage(): Storage {
	const store = new Map<string, string>()
	const storage: Storage = {
		get length() {
			return store.size
		},
		clear: () => store.clear(),
		getItem: (key) => store.get(key) ?? null,
		key: (index) => Array.from(store.keys())[index] ?? null,
		removeItem: (key) => {
			store.delete(key)
		},
		setItem: (key, value) => {
			store.set(key, value)
		},
	}
	vi.stubGlobal("localStorage", storage)
	return storage
}

afterEach(() => {
	vi.unstubAllGlobals()
})

function filledValues() {
	const values = MEMBER_WIZARD_DEFAULT_VALUES()
	values.first_name_th = "สมชาย"
	values.last_name_th = "ใจดี"
	values.nickname = "ชาย"
	values.phone_no = "081-234-5678"
	values.id_card_no = "1234567890123"
	values.company_certificate = { file: new File(["cert"], "cert.png", { type: "image/png" }), existingUrl: null }
	values.business.name = "สมชาย คอนสตรัคชั่น"
	values.business.category_id = "2"
	return values
}

describe("Member Form Draft storage", () => {
	describe("Happy cases", () => {
		test("save then read round-trips the draft with File selections excluded", () => {
			installMemoryLocalStorage()
			saveMemberFormDraft(filledValues())

			const draft = readMemberFormDraft()
			expect(draft).not.toBeNull()
			expect(draft?.first_name_th).toBe("สมชาย")
			expect(draft?.business.category_id).toBe("2")
			// Files are not serializable — the draft must not carry them (CONTEXT.md term).
			expect(draft?.company_certificate.file).toBeNull()
			expect(draft?.company_certificate.existingUrl).toBeNull()
			expect(JSON.stringify(draft)).not.toContain("cert.png")
		})

		test("restore merges the draft over pristine defaults so missing fields get defaults", () => {
			const storage = installMemoryLocalStorage()
			storage.setItem("yec-member-form-draft", JSON.stringify({ registration_type: "JURISTIC_PERSON", business: { name: "ร้านค้า" } }))

			const restored = restoreMemberFormDraft()
			expect(restored?.registration_type).toBe("JURISTIC_PERSON")
			expect(restored?.business.name).toBe("ร้านค้า")
			expect(restored?.business.category_id).toBe("")
			expect(restored?.nationality).toBe("ไทย")
			expect(restored?.position).toBe("GENERAL_MEMBER")
		})

		test("clear removes the draft so subsequent reads return null", () => {
			installMemoryLocalStorage()
			saveMemberFormDraft(filledValues())
			clearMemberFormDraft()
			expect(readMemberFormDraft()).toBeNull()
			expect(localStorage.getItem("yec-member-form-draft")).toBeNull()
		})
	})

	describe("Unhappy cases", () => {
		test("corrupt JSON reads back as null (and the bad entry is dropped)", () => {
			const storage = installMemoryLocalStorage()
			storage.setItem("yec-member-form-draft", "{not json")
			expect(readMemberFormDraft()).toBeNull()
			expect(storage.getItem("yec-member-form-draft")).toBeNull()
		})

		test("non-object payloads read back as null", () => {
			const storage = installMemoryLocalStorage()
			storage.setItem("yec-member-form-draft", "42")
			expect(restoreMemberFormDraft()).toBeNull()
			expect(storage.getItem("yec-member-form-draft")).toBeNull()
		})

		test("an unavailable localStorage reads as null and saves without throwing", () => {
			vi.stubGlobal("localStorage", {
				getItem: () => {
					throw new Error("private mode")
				},
				setItem: () => {
					throw new Error("private mode")
				},
				removeItem: () => {
					throw new Error("private mode")
				},
			})
			expect(readMemberFormDraft()).toBeNull()
			expect(() => saveMemberFormDraft(filledValues())).not.toThrow()
			expect(() => clearMemberFormDraft()).not.toThrow()
		})
	})
})
