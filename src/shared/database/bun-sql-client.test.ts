import "reflect-metadata";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BunSqlClient } from "./bun-sql-client";
import { sql } from "bun";

// Mock bun:sql
vi.mock("bun", () => {
  return {
    sql: {
      unsafe: vi.fn(),
    },
  };
});

describe("BunSqlClient", () => {
  let client: BunSqlClient;

  beforeEach(() => {
    client = new BunSqlClient();
    vi.clearAllMocks();
  });

  it("should execute query using sql.unsafe", async () => {
    const mockResult = [{ id: 1 }];
    (sql.unsafe as any).mockResolvedValue(mockResult);

    const result = await client.query("SELECT * FROM users WHERE id = $1", [1]);

    expect(sql.unsafe).toHaveBeenCalledWith("SELECT * FROM users WHERE id = $1", [1]);
    expect(result).toEqual(mockResult);
  });
});
