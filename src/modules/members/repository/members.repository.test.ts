import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mock, type MockProxy } from "vitest-mock-extended"

// Mock the generated queries file BEFORE imports
vi.mock("src/modules/members/repository/sql/sqlc-generated/queries_sql", () => ({
	getMemberPaymentHistoryByMemberId: vi.fn(),
	insertRegistrationPayment: vi.fn(),
	upsertRegistrationPayment: vi.fn(),
}))

// Mock bun package BEFORE imports
vi.mock("bun", () => ({
	SQL: vi.fn(),
}))

import type { GetMemberPaymentHistoryByMemberIdRow } from "src/modules/members/repository/sql/sqlc-generated/queries_sql"
import { getMemberPaymentHistoryByMemberId, insertRegistrationPayment, upsertRegistrationPayment } from "src/modules/members/repository/sql/sqlc-generated/queries_sql"
import { DatabaseClient } from "src/shared/lib/db/database-client"
import { SQL } from "bun"
import type { Sql } from "postgres"

import { DatabaseError } from "src/shared/core/errors/app-error"

import { MembersRepository } from "./members.repository"

describe("MembersRepository — Registration Payment ledger (ADR-0033)", () => {
	let repository: MembersRepository
	let mockDbClient: MockProxy<DatabaseClient>
	let mockSql: ReturnType<typeof vi.fn>

	beforeEach(() => {
		vi.clearAllMocks()

		mockDbClient = mock<DatabaseClient>()
		mockSql = vi.fn()
		mockDbClient.getRwConnection.mockReturnValue(mockSql as unknown as SQL)

		repository = new MembersRepository(mockDbClient)
	})

	describe("insertRegistrationPayment", () => {
		describe("Happy cases", () => {
			it("stringifies the member id, files the slip, returns the ledger id as a number", async () => {
				vi.mocked(insertRegistrationPayment).mockResolvedValueOnce([{ id: "91" }])

				const result = await repository.insertRegistrationPayment(mockSql as unknown as Sql, 42, "payment-slips/slip.jpg")

				expect(result).toBe(91)
				expect(insertRegistrationPayment).toHaveBeenLastCalledWith(mockSql, { memberId: "42", paymentSlipFilePath: "payment-slips/slip.jpg" })
			})
		})

		describe("Unhappy cases", () => {
			it("throws DatabaseError so the owning transaction rolls back", async () => {
				vi.mocked(insertRegistrationPayment).mockRejectedValueOnce(new Error("Connection refused"))

				const attempt = repository.insertRegistrationPayment(mockSql as unknown as Sql, 42, "payment-slips/slip.jpg")

				await expect(attempt).rejects.toBeInstanceOf(DatabaseError)
			})
		})
	})

	describe("upsertRegistrationPayment", () => {
		describe("Happy cases", () => {
			it("stringifies the member id and returns the (re-)filed ledger id as a number", async () => {
				vi.mocked(upsertRegistrationPayment).mockResolvedValueOnce([{ id: "7" }])

				const result = await repository.upsertRegistrationPayment(mockSql as unknown as Sql, 42, "payment-slips/replacement.jpg")

				expect(result).toBe(7)
				expect(upsertRegistrationPayment).toHaveBeenLastCalledWith(mockSql, { memberId: "42", paymentSlipFilePath: "payment-slips/replacement.jpg" })
			})
		})

		describe("Unhappy cases", () => {
			it("throws DatabaseError so the owning transaction rolls back", async () => {
				vi.mocked(upsertRegistrationPayment).mockRejectedValueOnce(new Error("Connection refused"))

				const attempt = repository.upsertRegistrationPayment(mockSql as unknown as Sql, 42, "payment-slips/replacement.jpg")

				await expect(attempt).rejects.toBeInstanceOf(DatabaseError)
			})
		})
	})

	describe("getMemberPaymentHistoryByMemberId", () => {
		function makeRow(overrides: Partial<GetMemberPaymentHistoryByMemberIdRow> = {}): GetMemberPaymentHistoryByMemberIdRow {
			return {
				type: "RENEWAL",
				paymentSlipFilePath: "payment-slips/renewal.jpg",
				paymentDateAt: new Date("2026-01-15T00:00:00Z"),
				status: "APPROVED",
				...overrides,
			}
		}

		describe("Happy cases", () => {
			it("returns both ledger types oldest-first, stringifying the id arg", async () => {
				const rows = [
					makeRow({ type: "REGISTRATION", paymentSlipFilePath: "payment-slips/registration.jpg" }),
					makeRow({ type: "RENEWAL", paymentDateAt: new Date("2026-11-01T00:00:00Z") }),
				]
				vi.mocked(getMemberPaymentHistoryByMemberId).mockResolvedValueOnce(rows)

				const result = await repository.getMemberPaymentHistoryByMemberId(42)

				expect(result.isOk()).toBe(true)
				expect(getMemberPaymentHistoryByMemberId).toHaveBeenLastCalledWith(mockSql, { memberId: "42" })
				expect(result._unsafeUnwrap()).toEqual([
					{ type: "REGISTRATION", paymentSlipFilePath: "payment-slips/registration.jpg", paymentDateAt: new Date("2026-01-15T00:00:00Z"), status: "APPROVED" },
					{ type: "RENEWAL", paymentSlipFilePath: "payment-slips/renewal.jpg", paymentDateAt: new Date("2026-11-01T00:00:00Z"), status: "APPROVED" },
				])
			})

			it("returns an empty array when the member has no live payment rows", async () => {
				vi.mocked(getMemberPaymentHistoryByMemberId).mockResolvedValueOnce([])

				const result = await repository.getMemberPaymentHistoryByMemberId(42)

				expect(result.isOk()).toBe(true)
				expect(result._unsafeUnwrap()).toEqual([])
			})
		})

		describe("Unhappy cases", () => {
			it("wraps a query failure as DatabaseError", async () => {
				vi.mocked(getMemberPaymentHistoryByMemberId).mockRejectedValueOnce(new Error("Connection refused"))

				const result = await repository.getMemberPaymentHistoryByMemberId(42)

				expect(result.isErr()).toBe(true)
				expect(result._unsafeUnwrapErr()).toBeInstanceOf(DatabaseError)
			})
		})
	})
})
