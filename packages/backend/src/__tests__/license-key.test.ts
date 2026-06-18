/**
 * Unit tests for the license key generation utility.
 */

import { describe, it, expect } from "vitest";
import { generateLicenseKey } from "../lib/license-key.js";

describe("generateLicenseKey", () => {
  it("should produce a key matching mn_live_ format", () => {
    const key = generateLicenseKey();
    expect(key).toMatch(/^mn_live_[0-9a-f]{48}$/);
  });

  it("should have 48 hex characters total (excluding prefix)", () => {
    const key = generateLicenseKey();
    const chars = key.replace(/^mn_live_/, "");
    expect(chars).toHaveLength(48);
  });

  it("should generate unique keys across 200 invocations", () => {
    const keys = new Set(
      Array.from({ length: 200 }, () => generateLicenseKey()),
    );
    expect(keys.size).toBe(200);
  });

  it("should start with the mn_live_ prefix", () => {
    const key = generateLicenseKey();
    expect(key.startsWith("mn_live_")).toBe(true);
  });

  it("should contain no dashes after the prefix", () => {
    const key = generateLicenseKey();
    const chars = key.replace(/^mn_live_/, "");
    const dashes = chars.split("").filter((c) => c === "-").length;
    expect(dashes).toBe(0);
  });
});
