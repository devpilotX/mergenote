import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import http from "node:http";
import { validateLicense, getLicenseStatus, resetLicenseCache } from "../src/license.js";

// Mini HTTP server that mocks devpilotx.com/api/license/validate
let mockServer: http.Server;
let mockPort: number;
let mockResponse: { status: number; body: unknown } = { status: 200, body: { valid: true, tier: "premium" } };

function startMock(): Promise<void> {
  return new Promise((resolve) => {
    mockServer = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        res.writeHead(mockResponse.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(mockResponse.body));
      });
    });
    mockServer.listen(0, "127.0.0.1", () => {
      const addr = mockServer.address() as { port: number };
      mockPort = addr.port;
      resolve();
    });
  });
}

function stopMock(): Promise<void> {
  return new Promise((resolve) => mockServer.close(() => resolve()));
}

describe("license validation — integration", () => {
  beforeEach(() => {
    resetLicenseCache();
    delete process.env.MERGENOTE_LICENSE_KEY;
    delete process.env.LICENSE_API_URL;
  });

  afterAll(async () => {
    if (mockServer?.listening) await stopMock();
  });

  it("Case A: no key → free tier, no network call", async () => {
    // No MERGENOTE_LICENSE_KEY set
    const status = await validateLicense();
    expect(status.valid).toBe(false);
    expect(status.tier).toBe("free");
    expect(getLicenseStatus().tier).toBe("free");
  });

  it("Case B: valid key + premium response → premium tier", async () => {
    await startMock();
    mockResponse = { status: 200, body: { valid: true, tier: "premium", email: "user@test.com", expires_at: null } };

    process.env.MERGENOTE_LICENSE_KEY = "mn_live_test123";
    process.env.LICENSE_API_URL = `http://127.0.0.1:${mockPort}/api/license/validate`;

    const status = await validateLicense();
    expect(status.valid).toBe(true);
    expect(status.tier).toBe("premium");

    await stopMock();
  });

  it("Case C: endpoint down → falls back to free, no crash", async () => {
    // Point to a port where nothing is listening
    process.env.MERGENOTE_LICENSE_KEY = "mn_live_test123";
    process.env.LICENSE_API_URL = "http://127.0.0.1:19999/api/license/validate";

    const status = await validateLicense();
    expect(status.valid).toBe(false);
    expect(status.tier).toBe("free");
  });

  it("Case C2: endpoint returns valid=false → free tier", async () => {
    await startMock();
    mockResponse = { status: 200, body: { valid: false, tier: "free" } };

    process.env.MERGENOTE_LICENSE_KEY = "mn_live_expired";
    process.env.LICENSE_API_URL = `http://127.0.0.1:${mockPort}/api/license/validate`;

    const status = await validateLicense();
    expect(status.valid).toBe(false);
    expect(status.tier).toBe("free");

    await stopMock();
  });

  it("Case B2: valid key + unknown tier → free (only 'premium' unlocks)", async () => {
    await startMock();
    mockResponse = { status: 200, body: { valid: true, tier: "team", email: "admin@corp.com", expires_at: "2027-12-31T00:00:00Z" } };

    process.env.MERGENOTE_LICENSE_KEY = "mn_live_team456";
    process.env.LICENSE_API_URL = `http://127.0.0.1:${mockPort}/api/license/validate`;

    const status = await validateLicense();
    expect(status.valid).toBe(true);
    expect(status.tier).toBe("free");

    await stopMock();
  });
});
