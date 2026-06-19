/**
 * License CRUD routes.
 *
 * Mounted at `/api/licenses` by the main Express app.
 *
 * | Method | Path                    | Description                     |
 * |--------|-------------------------|---------------------------------|
 * | POST   | /                       | Create a new license            |
 * | GET    | /:id                    | Get license by UUID             |
 * | GET    | /by-key/:key            | Get license by license_key      |
 * | GET    | /by-github/:login       | Get license by github_login     |
 * | PUT    | /:id                    | Update mutable license fields   |
 * | DELETE | /:id                    | Soft-delete (cancel) a license  |
 */

import { Router } from "express";
import type { Request, Response, Router as IRouter } from "express";
import { query } from "../lib/db.js";
import { generateLicenseKey } from "../lib/license-key.js";
import { validateBody, validateParam } from "../middleware/validate.js";

// -- Types --

export type Plan = "free" | "premium";
export type Status = "active" | "revoked" | "expired";

export interface LicenseRow {
  id: string;
  email: string;
  tier: Plan;
  status: Status;
  license_key: string | null;
  paypal_subscription_id: string | null;
  created_at: Date;
  updated_at: Date;
  revoked_at: Date | null;
}

export interface CreateLicenseBody {
  email: string;
  tier?: Plan;
}

export interface UpdateLicenseBody {
  email?: string;
  tier?: Plan;
  status?: Status;
  paypal_subscription_id?: string;
}

// -- Router --

export const licensesRouter: IRouter = Router();

/**
 * POST /api/licenses — Create a new license.
 */
licensesRouter.post(
  "/",
  validateBody([
    { name: "email", type: "string", required: true },
    { name: "tier", type: "string", oneOf: ["free", "premium"] }
  ]),
  async (req: Request, res: Response) => {
    const { email, tier } =
      req.body as CreateLicenseBody;

    const licenseKey = generateLicenseKey();
    const chosenPlan = tier ?? "free";

    const result = await query<LicenseRow>(
      `INSERT INTO licenses (email, tier, license_key)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [email, chosenPlan, licenseKey],
    );

    res.status(201).json(result.rows[0]);
  },
);

/**
 * GET /api/licenses/by-key/:key — Lookup by license_key.
 *
 * Registered before `/:id` so Express doesn't interpret "by-key" as a UUID.
 */
licensesRouter.get(
  "/by-key/:key",
  validateParam("key"),
  async (req: Request, res: Response) => {
    const { key } = req.params;

    const result = await query<LicenseRow>(
      `SELECT * FROM licenses WHERE license_key = $1 LIMIT 1`,
      [key],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "License not found" });
      return;
    }

    res.json(result.rows[0]);
  },
);



/**
 * GET /api/licenses/:id — Get a single license by UUID.
 */
licensesRouter.get(
  "/:id",
  validateParam("id"),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const result = await query<LicenseRow>(
      `SELECT * FROM licenses WHERE id = $1 LIMIT 1`,
      [id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "License not found" });
      return;
    }

    res.json(result.rows[0]);
  },
);

/**
 * PUT /api/licenses/:id — Update mutable fields on an existing license.
 */
licensesRouter.put(
  "/:id",
  validateParam("id"),
  validateBody([
    { name: "email", type: "string" },
    { name: "tier", type: "string", oneOf: ["free", "premium"] },
    {
      name: "status",
      type: "string",
      oneOf: ["active", "revoked", "expired"],
    },
    { name: "paypal_subscription_id", type: "string" },
  ]),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const body = req.body as UpdateLicenseBody;

    // Build SET clause dynamically from the fields that were actually sent.
    const allowed: (keyof UpdateLicenseBody)[] = [
      "email",
      "tier",
      "status",
      "paypal_subscription_id",
    ];

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    for (const field of allowed) {
      if (body[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex}`);
        values.push(body[field]);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    // Always bump updated_at
    setClauses.push(`updated_at = NOW()`);

    values.push(id);
    const sql = `UPDATE licenses SET ${setClauses.join(", ")} WHERE id = $${paramIndex} RETURNING *`;

    const result = await query<LicenseRow>(sql, values);

    if (result.rows.length === 0) {
      res.status(404).json({ error: "License not found" });
      return;
    }

    res.json(result.rows[0]);
  },
);

/**
 * DELETE /api/licenses/:id — Soft-delete by setting status to 'cancelled'.
 */
licensesRouter.delete(
  "/:id",
  validateParam("id"),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const result = await query<LicenseRow>(
      `UPDATE licenses SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "License not found" });
      return;
    }

    res.json(result.rows[0]);
  },
);
