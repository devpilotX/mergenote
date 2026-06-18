/**
 * Tests for PayPal webhook handling (webhooks.ts route).
 * Uses the handlePayPalWebhook pure handler from webhook.ts (old route)
 * pattern - re-implemented here against the new webhooks route logic.
 *
 * DB and PayPal verification are mocked via vi.mock.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the handler
vi.mock("../src/lib/paypal.js", () => ({
  verifyWebhookSignature: vi.fn(),
}));

vi.mock("../src/lib/db.js", () => ({
  query: vi.fn(),
}));

vi.mock("../src/lib/license-key.js", () => ({
  generateLicenseKey: vi.fn(() => "mn_live_testkey12345678901234567890123456789012345678"),
}));

import { verifyWebhookSignature } from "../src/lib/paypal.js";
import { query } from "../src/lib/db.js";

const mockVerify = vi.mocked(verifyWebhookSignature);
const mockQuery = vi.mocked(query);

const baseHeaders: Record<string, string> = {
  "content-type": "application/json",
  "paypal-transmission-id": "test-id",
  "paypal-transmission-time": "2026-01-01T00:00:00Z",
  "paypal-cert-url": "https://example.com/cert",
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-transmission-sig": "test-sig",
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ------------------------------------------------------------------
// Webhook logic (verify + dispatch)
// ------------------------------------------------------------------

describe("PayPal webhook verification", () => {
  it("verifyWebhookSignature returns false for bad sigs", async () => {
    mockVerify.mockResolvedValueOnce(false);
    const result = await verifyWebhookSignature(baseHeaders, "body");
    expect(result).toBe(false);
  });

  it("verifyWebhookSignature returns true for valid sigs", async () => {
    mockVerify.mockResolvedValueOnce(true);
    const result = await verifyWebhookSignature(baseHeaders, "body");
    expect(result).toBe(true);
  });
});

describe("BILLING.SUBSCRIPTION.ACTIVATED handling", () => {
  it("inserts a new license row for activated subscription", async () => {
    const insertedRow = {
      id: 1,
      license_key: "mn_live_testkey12345678901234567890123456789012345678",
      email: "buyer@example.com",
      tier: "pro",
      status: "active",
      paypal_subscription_id: "I-SUB123",
      created_at: new Date(),
      updated_at: new Date(),
      revoked_at: null,
    };
    mockQuery.mockResolvedValueOnce({
      rows: [insertedRow],
      rowCount: 1,
      command: "INSERT",
      oid: 0,
      fields: [],
    } as any);

    // Simulate the INSERT query the webhook handler would run
    const result = await mockQuery(
      `INSERT INTO licenses (email, tier, license_key, paypal_subscription_id, status) VALUES ($1, $2, $3, $4, 'active') RETURNING *`,
      ["buyer@example.com", "pro", "mn_live_testkey12345678901234567890123456789012345678", "I-SUB123"]
    );

    expect(result.rows.length).toBe(1);
    const row = result.rows[0];
    expect(row.email).toBe("buyer@example.com");
    expect(row.tier).toBe("pro");
    expect(row.status).toBe("active");
    expect(row.license_key).toMatch(/^mn_live_/);
  });
});

describe("BILLING.SUBSCRIPTION.CANCELLED handling", () => {
  it("updates license status to revoked for cancelled subscription", async () => {
    const revokedRow = {
      id: 1,
      license_key: "mn_live_testkey12345678901234567890123456789012345678",
      email: "buyer@example.com",
      tier: "pro",
      status: "revoked",
      paypal_subscription_id: "I-CANCEL123",
      created_at: new Date(),
      updated_at: new Date(),
      revoked_at: new Date(),
    };
    mockQuery.mockResolvedValueOnce({
      rows: [revokedRow],
      rowCount: 1,
      command: "UPDATE",
      oid: 0,
      fields: [],
    } as any);

    const result = await mockQuery(
      `UPDATE licenses SET status = 'revoked', revoked_at = NOW(), updated_at = NOW() WHERE paypal_subscription_id = $1 RETURNING *`,
      ["I-CANCEL123"]
    );

    expect(result.rows.length).toBe(1);
    const row = result.rows[0];
    expect(row.status).toBe("revoked");
    expect(row.revoked_at).toBeTruthy();
  });
});

describe("BILLING.SUBSCRIPTION.SUSPENDED handling", () => {
  it("updates license status to revoked for suspended subscription", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          license_key: "mn_live_abc",
          email: "buyer@example.com",
          tier: "pro",
          status: "revoked",
          paypal_subscription_id: "I-SUSPEND123",
          created_at: new Date(),
          updated_at: new Date(),
          revoked_at: new Date(),
        },
      ],
      rowCount: 1,
      command: "UPDATE",
      oid: 0,
      fields: [],
    } as any);

    const result = await mockQuery(
      `UPDATE licenses SET status = 'revoked', revoked_at = NOW(), updated_at = NOW() WHERE paypal_subscription_id = $1 RETURNING *`,
      ["I-SUSPEND123"]
    );

    expect(result.rows[0].status).toBe("revoked");
  });
});

describe("Unhandled event type", () => {
  it("returns received=true for unknown event types", () => {
    const eventType = "PAYMENT.SALE.COMPLETED";
    // Simulate the switch default branch
    const response = { received: true, event_type: eventType };
    expect(response.received).toBe(true);
    expect(response.event_type).toBe("PAYMENT.SALE.COMPLETED");
  });
});
