import type { LicenseStatus } from "./types.js";

const FREE_STATUS: LicenseStatus = { valid: false, tier: "free" };

let cachedStatus: LicenseStatus | null = null;

/**
 * Returns the cached license status. Call `validateLicense` first to populate it.
 */
export function getLicenseStatus(): LicenseStatus {
  return cachedStatus ?? FREE_STATUS;
}

/**
 * Validates the MERGENOTE_LICENSE key against the licensing backend.
 * Stores the result in memory so subsequent calls return instantly.
 *
 * If no license key is set, or the backend is unreachable, this returns
 * a free-tier status without throwing.
 */
export async function validateLicense(): Promise<LicenseStatus> {
  const licenseKey = process.env.MERGENOTE_LICENSE;
  if (!licenseKey) {
    cachedStatus = FREE_STATUS;
    return cachedStatus;
  }

  const baseUrl =
    process.env.LICENSE_API_URL?.replace(/\/+$/, "") ||
    "http://localhost:3100";

  try {
    const response = await fetch(`${baseUrl}/api/license/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: licenseKey }),
    });

    if (!response.ok) {
      console.error(
        `License validation returned ${response.status}. Falling back to free tier.`
      );
      cachedStatus = FREE_STATUS;
      return cachedStatus;
    }

    const data = (await response.json()) as {
      valid: boolean;
      tier?: "free" | "pro";
      email?: string;
      expires_at?: string;
    };

    cachedStatus = {
      valid: data.valid,
      tier: data.valid && data.tier === "pro" ? "pro" : "free",
      email: data.email,
      expires_at: data.expires_at,
    };

    return cachedStatus;
  } catch (err) {
    console.error(
      `License validation failed: ${err instanceof Error ? err.message : String(err)}. Falling back to free tier.`
    );
    cachedStatus = FREE_STATUS;
    return cachedStatus;
  }
}

/**
 * Resets the cached license status. Useful in tests.
 */
export function resetLicenseCache(): void {
  cachedStatus = null;
}

/**
 * Checks whether a given date range exceeds the free tier limit of 7 days.
 * Returns true if the range is within the allowed window.
 */
export function isWithinFreeTierWindow(
  since: Date,
  until: Date
): boolean {
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return until.getTime() - since.getTime() <= sevenDaysMs;
}
