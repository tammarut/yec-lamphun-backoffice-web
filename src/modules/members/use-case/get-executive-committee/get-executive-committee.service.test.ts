import { err, ok } from "neverthrow"
import { beforeEach, describe, expect, test } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"

import { DatabaseError } from "src/shared/core/errors/app-error"
import type { PositionReadModel } from "../../domain/member-read-models"
import type { IMemberRepository } from "../../interfaces"
import { MemberFileUrlService } from "../../member-file-url.service"
import type { ExecutiveCommitteeMemberRow, ExecutiveCommitteeNode } from "./get-executive-committee.types"
import { GetExecutiveCommitteeService } from "./get-executive-committee.service"

// Fixture builders -----------------------------------------------------------

function position(code: string, nameTh: string, parentPositionCode: string | null, displayOrder: number): PositionReadModel {
	return { code, nameTh, nameEn: code, cardinality: "MULTIPLE", parentPositionCode, displayOrder, isActive: true }
}

function member(id: number, positionCode: string, overrides: Partial<ExecutiveCommitteeMemberRow> = {}): ExecutiveCommitteeMemberRow {
	return {
		id,
		profileAvatar: null,
		titleNameTh: "นาย",
		firstNameTh: `สมชาย${id}`,
		lastNameTh: "ใจดี",
		nickname: `c${id}`,
		positionCode,
		businessName: `บริษัท ${id}`,
		...overrides,
	}
}

// A position-subset fixture mirroring the seed's hierarchy + display orders.
const seedPositions: PositionReadModel[] = [
	position("GENERAL_MEMBER", "สมาชิกทั่วไป", null, 100),
	position("PRESIDENT", "ประธาน YEC Lamphun", null, 200),
	position("ADVISORY_BOARD", "กรรมการที่ปรึกษา", "PRESIDENT", 250),
	position("SECRETARY", "เลขาธิการ", "PRESIDENT", 300),
	position("ASST_SECRETARY", "ผู้ช่วยเลขาธิการ", "SECRETARY", 310),
	position("TREASURER", "เหรัญญิก", "PRESIDENT", 320),
	position("LEGAL_COORDINATOR", "ผู้ประสานงานด้านกฎหมายและข้อบังคับ", "PRESIDENT", 330),
	position("VP_ADMIN_INTERNAL", "รองประธานฝ่ายบริหารและประสานงานภายใน", "PRESIDENT", 400),
	position("COMM_ADMIN_INTERNAL", "กรรมการฝ่ายบริหารและประสานงานภายใน", "VP_ADMIN_INTERNAL", 410),
]

describe("GetExecutiveCommitteeService", () => {
	let service: GetExecutiveCommitteeService
	let mockRepo: MockProxy<IMemberRepository>
	let mockUrlService: MockProxy<MemberFileUrlService>

	beforeEach(() => {
		mockRepo = mock<IMemberRepository>()
		mockUrlService = mock<MemberFileUrlService>()
		mockUrlService.resolveProfileAvatarUrl.mockImplementation((path) => (path === null ? null : `https://public.example/${path}`))
		mockRepo.getAllPositions.mockResolvedValue(ok(seedPositions))
		service = new GetExecutiveCommitteeService(mockRepo, mockUrlService)
	})

	describe("execute", () => {
		describe("Happy cases", () => {
			test("assembles the full seed-shaped tree with correct nesting, Thai names, and sibling order", async () => {
				// Rows arrive in (display_order, id) order, as the repo guarantees.
				mockRepo.getExecutiveCommittee.mockResolvedValue(
					ok([
						member(1, "PRESIDENT", { profileAvatar: "members/profile_avatars/president.png" }),
						member(2, "ADVISORY_BOARD", { businessName: null }),
						member(3, "ADVISORY_BOARD"),
						member(4, "SECRETARY"),
						member(7, "ASST_SECRETARY"),
						member(5, "TREASURER"),
						member(6, "LEGAL_COORDINATOR"),
						member(8, "VP_ADMIN_INTERNAL"),
						member(9, "COMM_ADMIN_INTERNAL"),
						member(10, "COMM_ADMIN_INTERNAL"),
					])
				)

				const result = await service.execute()
				const root = result._unsafeUnwrap()

				expect(root?.id).toBe(1)
				expect(root?.position).toBe("ประธาน YEC Lamphun")

				// President's direct reports in display_order: advisory (250,
				// MULTIPLE → both holders, id order), secretary (300), treasurer
				// (320), legal (330), VP (400). ASST_SECRETARY (310) is NOT here.
				expect(root?.children.map((child) => child.id)).toEqual([2, 3, 4, 5, 6, 8])

				const secretary = root?.children[2]
				expect(secretary?.position).toBe("เลขาธิการ")
				expect(secretary?.children.map((child) => child.id)).toEqual([7])

				const vp = root?.children[5]
				expect(vp?.position).toBe("รองประธานฝ่ายบริหารและประสานงานภายใน")
				expect(vp?.children.map((child) => child.id)).toEqual([9, 10])
				expect(vp?.children[0]?.children).toEqual([])
			})

			test("resolves avatar keys to public URLs and passes null avatar/business through untouched", async () => {
				mockRepo.getExecutiveCommittee.mockResolvedValue(
					ok([
						member(1, "PRESIDENT", { profileAvatar: "members/profile_avatars/president.png" }),
						member(2, "ADVISORY_BOARD", { profileAvatar: null, businessName: null }),
					])
				)

				const root = (await service.execute())._unsafeUnwrap()

				expect(root?.profile_avatar).toBe("https://public.example/members/profile_avatars/president.png")
				const advisory = root?.children[0]
				expect(advisory?.profile_avatar).toBeNull()
				expect(advisory?.business_name).toBeNull()
				expect(advisory?.title_name_th).toBe("นาย")
				expect(advisory?.nickname).toBe("c2")
			})

			test("materializes ONE shared Vacant Position placeholder for an unheld rung", async () => {
				// No VP_ADMIN_INTERNAL holder; two committee members report to it.
				mockRepo.getExecutiveCommittee.mockResolvedValue(ok([member(1, "PRESIDENT"), member(9, "COMM_ADMIN_INTERNAL"), member(10, "COMM_ADMIN_INTERNAL")]))

				const root = (await service.execute())._unsafeUnwrap()

				expect(root?.children).toHaveLength(1)
				const placeholder = root?.children[0]
				expect(placeholder?.id).toBeNull()
				expect(placeholder?.position).toBe("รองประธานฝ่ายบริหารและประสานงานภายใน")
				expect(placeholder?.profile_avatar).toBeNull()
				expect(placeholder?.title_name_th).toBeNull()
				expect(placeholder?.first_name_th).toBeNull()
				expect(placeholder?.last_name_th).toBeNull()
				expect(placeholder?.nickname).toBeNull()
				expect(placeholder?.business_name).toBeNull()
				// Both committee members share the single placeholder.
				expect(placeholder?.children.map((child) => child.id)).toEqual([9, 10])
			})

			test("materializes a chain of placeholders for a multi-rung gap", async () => {
				const positions: PositionReadModel[] = [
					position("PRESIDENT", "ประธาน YEC Lamphun", null, 200),
					position("P_MID1", "ระดับกลาง 1", "PRESIDENT", 400),
					position("P_MID2", "ระดับกลาง 2", "P_MID1", 410),
					position("P_LEAF", "ระดับปลาย", "P_MID2", 420),
				]
				mockRepo.getAllPositions.mockResolvedValue(ok(positions))
				mockRepo.getExecutiveCommittee.mockResolvedValue(ok([member(1, "PRESIDENT"), member(9, "P_LEAF")]))

				const root = (await service.execute())._unsafeUnwrap()

				// root → ph(MID1) → ph(MID2) → leaf member
				const mid1 = root?.children[0]
				expect(mid1?.id).toBeNull()
				expect(mid1?.position).toBe("ระดับกลาง 1")
				const mid2 = mid1?.children[0]
				expect(mid2?.id).toBeNull()
				expect(mid2?.position).toBe("ระดับกลาง 2")
				expect(mid2?.children.map((child) => child.id)).toEqual([9])
			})

			test("returns null when the PRESIDENT holder is missing even though other members exist", async () => {
				mockRepo.getExecutiveCommittee.mockResolvedValue(ok([member(4, "SECRETARY"), member(7, "ASST_SECRETARY")]))

				const result = await service.execute()

				expect(result._unsafeUnwrap()).toBeNull()
			})

			test("returns null when there are no committee members at all", async () => {
				mockRepo.getExecutiveCommittee.mockResolvedValue(ok([]))

				const result = await service.execute()

				expect(result._unsafeUnwrap()).toBeNull()
			})

			test("attaches a second top-level position (never reaching PRESIDENT) directly to the root instead of dropping it", async () => {
				const positions: PositionReadModel[] = [position("PRESIDENT", "ประธาน YEC Lamphun", null, 200), position("FOUNDER", "ที่ปรึกษากิตติมศักดิ์", null, 210)]
				mockRepo.getAllPositions.mockResolvedValue(ok(positions))
				mockRepo.getExecutiveCommittee.mockResolvedValue(ok([member(1, "PRESIDENT"), member(11, "FOUNDER")]))

				const root = (await service.execute())._unsafeUnwrap()

				expect(root?.children.map((child) => child.id)).toEqual([11])
			})

			test("breaks a parent_position_code cycle without weaving a circular node graph", async () => {
				const positions: PositionReadModel[] = [
					position("PRESIDENT", "ประธาน YEC Lamphun", null, 200),
					position("POS_A", "ตำแหน่ง เอ", "POS_B", 500),
					position("POS_B", "ตำแหน่ง บี", "POS_A", 510),
				]
				mockRepo.getAllPositions.mockResolvedValue(ok(positions))
				mockRepo.getExecutiveCommittee.mockResolvedValue(ok([member(1, "PRESIDENT"), member(21, "POS_A")]))

				const root = (await service.execute())._unsafeUnwrap()

				// A's holder renders under a placeholder for B, which falls back
				// to the root (the cycle guard) — a serializable tree, no hang,
				// no circular reference.
				expect(() => JSON.stringify(root)).not.toThrow()
				const placeholder = root?.children.find((child): child is ExecutiveCommitteeNode => child.id === null)
				expect(placeholder?.position).toBe("ตำแหน่ง บี")
				expect(placeholder?.children.map((child) => child.id)).toEqual([21])
			})

			test("keeps the tree serializable when BOTH sides of a position cycle are held", async () => {
				const positions: PositionReadModel[] = [
					position("PRESIDENT", "ประธาน YEC Lamphun", null, 200),
					position("POS_A", "ตำแหน่ง เอ", "POS_B", 500),
					position("POS_B", "ตำแหน่ง บี", "POS_A", 510),
				]
				mockRepo.getAllPositions.mockResolvedValue(ok(positions))
				mockRepo.getExecutiveCommittee.mockResolvedValue(ok([member(1, "PRESIDENT"), member(21, "POS_A"), member(22, "POS_B")]))

				const root = (await service.execute())._unsafeUnwrap()

				// A attaches under B's holder; B would attach under A's holder
				// (inside B's own subtree) — the descendant guard reroutes B to
				// the root instead of weaving A ↔ B. Result: root → 22 → 21.
				expect(() => JSON.stringify(root)).not.toThrow()
				expect(root?.children.map((child) => child.id)).toEqual([22])
				const holderB = root?.children.find((child) => child.id === 22)
				expect(holderB?.children.map((child) => child.id)).toEqual([21])
			})
		})

		describe("Unhappy cases", () => {
			test("propagates the error when getAllPositions fails (members read never runs)", async () => {
				mockRepo.getAllPositions.mockResolvedValue(err(new DatabaseError("positions boom")))

				const result = await service.execute()

				expect(result._unsafeUnwrapErr()).toBeInstanceOf(DatabaseError)
				expect(mockRepo.getExecutiveCommittee).not.toHaveBeenCalled()
			})

			test("propagates the error when getExecutiveCommittee fails", async () => {
				mockRepo.getExecutiveCommittee.mockResolvedValue(err(new DatabaseError("members boom")))

				const result = await service.execute()

				expect(result._unsafeUnwrapErr()).toBeInstanceOf(DatabaseError)
			})
		})
	})
})
