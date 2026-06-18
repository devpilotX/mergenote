/**
 * License API routes used by the MCP server.
 *
 * Mounted at `/api/license` by the main Express app.
 *
 * | Method | Path       | Description                         |
 * |--------|------------|-------------------------------------|
 * | POST   | /validate  | Validate a license key              |
 * | GET    | /status    | Get full status for a license key   |
 */

import { Router } from "express";
import type { Request, Response, Router as IRouter } from "express";
import { query } from "../lib/db.js";

export const licenseApiRouter: IRouter = Router();

interface LicenseRow {
  license_key: string;
  email: string;
  tier: string;
  status: string;
  created_at: Date;
}

/**
 * POST /api/license/validate
 * Body: { key: string }
 * Returns: { valid: boolean, tier: string, email?: string }
 */
licenseApiRouter.post("/validate", async (req: Request, res: Response) => {
  const { key } = req.body as { key?: string };

  if (!key || typeof key !== "string" || key.trim() === "") {
    res.status(400).json({ valid: false, tier: "free", error: "key is required" });
    return;
  }

  const result = await query<LicenseRow>(
    `SELECT license_key, email, tier, status FROM licenses WHERE license_key = $1 LIMIT 1`,
    [key.trim()]
  );

  if (result.rows.length === 0) {
    res.json({ valid: false, tier: "free" });
    return;
  }

  const license = result.rows[0];

  if (license.status !== "active") {
    res.json({ valid: false, tier: "free" });
    return;
  }

  res.json({
    valid: true,
    tier: license.tier,
    email: license.email,
  });
});

/**
 * GET /api/license/status?key=mn_live_...
 * Returns: { key, tier, status, email, created_at }
 */
licenseApiRouter.get("/status", async (req: Request, res: Response) => {
  const key = req.query.key as string | undefined;

  if (!key || key.trim() === "") {
    res.status(400).json({ error: "key query parameter is required" });
    return;
  }

  const result = await query<LicenseRow>(
    `SELECT license_key, email, tier, status, created_at FROM licenses WHERE license_key = $1 LIMIT 1`,
    [key.trim()]
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: "license not found" });
    return;
  }

  const license = result.rows[0];
  res.json({
    key: license.license_key,
    tier: license.tier,
    status: license.status,
    email: license.email,
    created_at: license.created_at.toISOString(),
  });
});
