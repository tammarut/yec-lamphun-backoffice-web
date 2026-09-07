import { describe, expect, test } from "vitest"

import { buildMembersCsv } from "src/shared/components/members/export-members-csv"
import { makeMember } from "src/shared/components/members/make-member.fixture"

describe("buildMembersCsv", () => {
	describe("Happy cases", () => {
		test("starts with the UTF-8 BOM so Excel renders Thai", () => {
			expect(buildMembersCsv([]).startsWith("\uFEFF")).toBe(true)
		})

		test("emits the Thai header row in the card's exact column order", () => {
			const csv = buildMembersCsv([])
			const lines = csv.split("\n")
			expect(lines[0]).toBe('\uFEFF"ชื่อ-นามสกุล","ชื่อเล่น","ตำแหน่ง","กิจการ","เบอร์โทร","อีเมล","สถานะ"')
		})

		test("maps a member row: glued Thai full name, position label, business, contacts, status label", () => {
			const csv = buildMembersCsv([makeMember()])
			const lines = csv.split("\n")
			expect(lines[1]).toBe('"นายสมชาย ใจดี","ชาย","สมาชิกทั่วไป","ร้านกาแฟสมชาย","089-111-2222","somchai@example.com","ปกติ"')
		})

		test("maps EXPIRED and PENDING_RENEWAL to ยังไม่ได้ต่ออายุ and RESIGNED to ลาออก", () => {
			const csv = buildMembersCsv([makeMember({ id: 2, status: "EXPIRED" }), makeMember({ id: 3, status: "PENDING_RENEWAL" }), makeMember({ id: 4, status: "RESIGNED" })])
			const lines = csv.split("\n")
			expect(lines[1]!.endsWith('"ยังไม่ได้ต่ออายุ"')).toBe(true)
			expect(lines[2]!.endsWith('"ยังไม่ได้ต่ออายุ"')).toBe(true)
			expect(lines[3]!.endsWith('"ลาออก"')).toBe(true)
		})

		test("escapes embedded double quotes by doubling them", () => {
			const csv = buildMembersCsv([makeMember({ nickname: 'หมี"บอส' })])
			expect(csv.split("\n")[1]).toContain('"หมี""บอส"')
		})

		test("renders null email as an empty quoted field", () => {
			const csv = buildMembersCsv([makeMember({ email: null })])
			expect(csv.split("\n")[1]).toContain('"","ปกติ"')
		})
	})

	describe("Unhappy cases", () => {
		test("empty input produces only the header line", () => {
			const csv = buildMembersCsv([])
			expect(csv.split("\n")).toHaveLength(1)
		})

		test("unknown position code falls back to the raw code", () => {
			const csv = buildMembersCsv([makeMember({ position: "FUTURE_POSITION" })])
			expect(csv.split("\n")[1]).toContain('"FUTURE_POSITION"')
		})
	})
})
