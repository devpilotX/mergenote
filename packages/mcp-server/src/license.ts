import type { LicenseStatus } from "./types.js";

const FREE_STATUS: LicenseStatus = { valid: false, tier: "free" };

let cachedStatus: LicenseStatus | null = null;

export function getLicenseStatus(): LicenseStatus {
  return cachedStatus ?? FREE_STATUS;
}

/**
 * Validates MERGENOTE_LICENSE_KEY against devpilotx.com (or LICENSE_API_URL override).
 * Caches result for the session. Never throws — falls back to free on any failure.
 */
export async function validateLicense(): Promise<LicenseStatus> {
  const key = process.env.MERGENOTE_LICENSE_KEY;
  if (!key) {
    cachedStatus = FREE_STATUS;
    return cachedStatus;
  }

  const url =
    process.env.LICENSE_API_URL?.replace(/\/+$/, "") ||
    "https://devpilotx.com/api/license/validate";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.error(`License validation returned ${res.status}. Falling back to free tier.`);
      cachedStatus = FREE_STATUS;
      return cachedStatus;
    }

    const data = (await res.json()) as {
      valid: boolean;
      tier?: "free" | "premium";
      email?: string;
      expires_at?: string | null;
    };

    if (!data.valid) {
      cachedStatus = FREE_STATUS;
      return cachedStatus;
    }

    cachedStatus = {
      valid: true,
      tier: data.tier === "premium" ? "premium" : "free",
      email: data.email,
      expires_at: data.expires_at ?? undefined,
    };
    return cachedStatus;
  } catch (err) {
    console.error(
      `License validation failed: ${err instanceof Error ? err.message : String(err)}. Falling back to free tier.`,
    );
    cachedStatus = FREE_STATUS;
    return cachedStatus;
  }
}

export function resetLicenseCache(): void {
  cachedStatus = null;
}

export function isWithinFreeTierWindow(since: Date, until: Date): boolean {
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return until.getTime() - since.getTime() <= sevenDaysMs;
}
