/**
 * License key generation utility.
 *
 * Produces keys in the format `MN-XXXXX-XXXXX-XXXXX-XXXXX` where each X
 * is an uppercase alphanumeric character (A-Z, 0-9).  Keys are generated
 * using Node's built-in `crypto.randomBytes` for cryptographic randomness.
 */

import crypto from "node:crypto";

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const GROUP_LENGTH = 5;
const GROUP_COUNT = 4;
const PREFIX = "mn_live_";

/**
 * Generate a random alphanumeric string of the given length.
 */
function randomAlphanumeric(length: number): string {
  const bytes = crypto.randomBytes(length / 2);
  return bytes.toString("hex");
}

/**
 * Generate a unique license key.
 *
 * @returns A key formatted as `mn_live_XXXXX`
 */
export function generateLicenseKey(): string {
  return `${PREFIX}${randomAlphanumeric(48)}`;
}
