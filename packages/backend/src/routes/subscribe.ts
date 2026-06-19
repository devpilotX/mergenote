/**
 * Subscription routes - called by frontend after PayPal subscription is approved.
 * 
 * POST /api/subscribe/activate
 * Body: { subscriptionId, planId }
 * Requires: authenticated user (JWT cookie)
 * 
 * This creates the license immediately for the logged-in user.
 * The webhook also handles it (idempotent) for production reliability.
 */

import { Router } from "express";
import type { Request, Response, Router as IRouter } from "express";
import jwt from "jsonwebtoken";
import { query } from "../lib/db.js";
import { generateLicenseKey } from "../lib/license-key.js";

export const subscribeRouter: IRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET!;

type Plan = "pro" | "team";

function planIdToTier(planId: string | undefined): Plan {
  if (planId && process.env.PAYPAL_PLAN_ID_TEAM && planId === process.env.PAYPAL_PLAN_ID_TEAM) {
    return "team";
  }
  return "pro";
}

subscribeRouter.post("/activate", async (req: Request, res: Response) => {
  try {
    // Require auth
    const token = req.cookies?.token;
    if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }

    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; githubLogin: string };
    const { subscriptionId, planId } = req.body as { subscriptionId?: string; planId?: string };

    if (!subscriptionId) {
      res.status(400).json({ error: "subscriptionId required" });
      return;
    }

    const tier = planIdToTier(planId);

    // Idempotent: upsert by paypal_subscription_id
    const result = await query(
      `INSERT INTO licenses (license_key, email, tier, status, paypal_subscription_id, user_id)
       VALUES ($1, (SELECT email FROM users WHERE id = $2), $3, 'active', $4, $2)
       ON CONFLICT (paypal_subscription_id) DO UPDATE SET
         status = 'active', tier = EXCLUDED.tier, user_id = EXCLUDED.user_id, updated_at = NOW(), revoked_at = NULL
       RETURNING *`,
      [generateLicenseKey(), payload.userId, tier, subscriptionId],
    );

    console.log(`[subscribe] Activated ${tier} for user ${payload.userId} (sub: ${subscriptionId})`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("[subscribe] Error:", err);
    res.status(500).json({ error: "Failed to activate subscription" });
  }
});
