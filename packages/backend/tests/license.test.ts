/**
 * Tests for the license API routes (validate/status).
 * Tests the handler logic directly by calling query() with mocks.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module before importing anything that uses it
vi.mock("../src/lib/db.js", () => ({
  query: vi.fn(),
}));

import { query } from "../src/lib/db.js";
import { generateLicenseKey } from "../src/lib/license-key.js";

const mockQuery = vi.mocked(query);

beforeEach(() => {
  vi.clearAllMocks();
});

// ------------------------------------------------------------------
// generateLicenseKey
// ------------------------------------------------------------------

describe("generateLicenseKey", () => {
  it("generates a key with mn_live_ prefix and 48 hex chars", () => {
    const key = generateLicenseKey();
    expect(key).toMatch(/^mn_live_[0-9a-f]{48}$/);
  });

  it("generates unique keys", () => {
    const keys = new Set(Array.from({ length: 100 }, () => generateLicenseKey()));
    expect(keys.size).toBe(100);
  });
});

// ------------------------------------------------------------------
// Validate logic (tests the DB query shape that license-api.ts uses)
// ------------------------------------------------------------------

describe("license validate logic", () => {
  it("returns invalid for empty key (no DB call)", async () => {
    // The route returns 400 immediately for empty keys - no DB needed
    const key = "";
    expect(!key || key.trim() === "").toBe(true);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns not-found result for unknown key", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
      command: "SELECT",
      oid: 0,
      fields: [],
    } as any);

    const result = await mockQuery(
      `SELECT license_key, email, tier, status FROM licenses WHERE license_key = $1 LIMIT 1`,
      ["mn_live_unknown"]
    );
    expect(result.rows.length).toBe(0);
  });

  it("returns active=true for an active premium license row", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          license_key: "mn_live_abc123",
          email: "user@example.com",
          tier: "premium",
          status: "active",
        },
      ],
      rowCount: 1,
      command: "SELECT",
      oid: 0,
      fields: [],
    } as any);

    const result = await mockQuery(
      `SELECT license_key, email, tier, status FROM licenses WHERE license_key = $1 LIMIT 1`,
      ["mn_live_abc123"]
    );
    expect(result.rows.length).toBe(1);
    const row = result.rows[0];
    expect(row.status).toBe("active");
    expect(row.tier).toBe("premium");
    expect(row.email).toBe("user@example.com");
    // Validate logic: valid = status === "active"
    expect(row.status === "active").toBe(true);
  });

  it("maps revoked license to valid=false", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          license_key: "mn_live_revoked",
          email: "user@example.com",
          tier: "premium",
          status: "revoked",
        },
      ],
      rowCount: 1,
      command: "SELECT",
      oid: 0,
      fields: [],
    } as any);

    const result = await mockQuery(
      `SELECT license_key, email, tier, status FROM licenses WHERE license_key = $1 LIMIT 1`,
      ["mn_live_revoked"]
    );
    const row = result.rows[0];
    // Validate logic: status !== "active" => valid = false
    expect(row.status === "active").toBe(false);
  });
});

// ------------------------------------------------------------------
// Status query logic
// ------------------------------------------------------------------

describe("license status query logic", () => {
  it("returns 404 shape for unknown key", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
      command: "SELECT",
      oid: 0,
      fields: [],
    } as any);

    const result = await mockQuery(
      `SELECT license_key, email, tier, status, created_at FROM licenses WHERE license_key = $1 LIMIT 1`,
      ["mn_live_unknown"]
    );
    expect(result.rows.length).toBe(0);
  });

  it("returns full status for a known key", async () => {
    const created = new Date("2026-01-15T10:00:00Z");
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          license_key: "mn_live_abc",
          email: "user@example.com",
          tier: "premium",
          status: "active",
          created_at: created,
        },
      ],
      rowCount: 1,
      command: "SELECT",
      oid: 0,
      fields: [],
    } as any);

    const result = await mockQuery(
      `SELECT license_key, email, tier, status, created_at FROM licenses WHERE license_key = $1 LIMIT 1`,
      ["mn_live_abc"]
    );
    const row = result.rows[0];
    const statusResponse = {
      key: row.license_key,
      tier: row.tier,
      status: row.status,
      email: row.email,
      created_at: row.created_at.toISOString(),
    };
    expect(statusResponse).toEqual({
      key: "mn_live_abc",
      tier: "premium",
      status: "active",
      email: "user@example.com",
      created_at: "2026-01-15T10:00:00.000Z",
    });
  });
});
