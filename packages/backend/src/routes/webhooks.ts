/**
 * PayPal webhook routes.
 *
 * Mounted at `/api/webhooks` by the main Express app.
 *
 * Handles:
 * - `BILLING.SUBSCRIPTION.ACTIVATED`  → activate license, store paypal_sub_id
 * - `BILLING.SUBSCRIPTION.CANCELLED`  → set status to 'revoked'
 * - `BILLING.SUBSCRIPTION.SUSPENDED`  → set status to 'revoked'
 * - `BILLING.SUBSCRIPTION.EXPIRED`    → set status to 'expired'
 */

import { Router } from "express";
import type { Request, Response, Router as IRouter } from "express";
import { query } from "../lib/db.js";
import { generateLicenseKey } from "../lib/license-key.js";
import { verifyWebhookSignature } from "../lib/paypal.js";
import type { LicenseRow, Plan } from "./licenses.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface WebhookEvent {
  id: string;
  event_type: string;
  resource: {
    id: string;
    plan_id?: string;
    quantity?: string;
    subscriber?: {
      email_address?: string;
      payer_id?: string;
    };
    custom_id?: string;
    status?: string;
    [key: string]: unknown;
  };
  summary?: string;
  create_time?: string;
}

/**
 * Map a PayPal plan_id to one of our plan tiers.
 *
 * Reads PAYPAL_PRO_PLAN_ID and PAYPAL_TEAM_PLAN_ID from the environment.
 * Falls back to "pro" when no match is found.
 */
function planIdToTier(planId: string | undefined): Plan {
  if (!planId) return "pro";
  if (
    process.env.PAYPAL_TEAM_PLAN_ID &&
    planId === process.env.PAYPAL_TEAM_PLAN_ID
  ) {
    return "team";
  }
  return "pro";
}

// -- Router --

export const webhooksRouter: IRouter = Router();

/**
 * POST /api/webhooks/paypal — Receive and process PayPal subscription webhooks.
 */
webhooksRouter.post("/paypal", async (req: Request, res: Response) => {
  // Use the raw body captured by the verify middleware for signature verification.
  const rawBody = ((req as unknown as Record<string, Buffer>).rawBody ?? Buffer.from("")).toString("utf-8");

  // ── Signature verification ───────────────────────────────────────
  const verified = await verifyWebhookSignature(
    req.headers as Record<string, string | string[] | undefined>,
    rawBody,
  );

  if (!verified) {
    console.error("[webhook] PayPal webhook signature verification failed");
    res.status(401).json({ error: "Webhook verification failed" });
    return;
  }

  // ── Parse event ──────────────────────────────────────────────────
  let event: WebhookEvent;
  try {
    event =
      typeof req.body === "string"
        ? (JSON.parse(req.body) as WebhookEvent)
        : (req.body as WebhookEvent);
  } catch {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  const { event_type: eventType, resource } = event;
  const subscriptionId = resource?.id;

  if (!subscriptionId) {
    res.status(400).json({ error: "Missing resource.id in webhook payload" });
    return;
  }

  console.log(
    `[webhook] Received ${eventType} for subscription ${subscriptionId}`,
  );

  // ── Event dispatch ───────────────────────────────────────────────
  switch (eventType) {
    case "BILLING.SUBSCRIPTION.ACTIVATED": {
      const email = resource.subscriber?.email_address;
      const plan = planIdToTier(resource.plan_id);

      if (!email) {
        res.status(400).json({
          error: "Subscriber email is required for activation",
        });
        return;
      }

      const licenseKey = generateLicenseKey();

      const result = await query<LicenseRow>(
        `INSERT INTO licenses
           (email, tier, license_key, paypal_subscription_id, status)
         VALUES ($1, $2, $3, $4, 'active')
         RETURNING *`,
        [email, plan, licenseKey, subscriptionId],
      );

      console.log(
        `[webhook] Activated ${plan} license for ${email} (sub: ${subscriptionId})`,
      );
      res.status(201).json(result.rows[0]);
      return;
    }

    case "BILLING.SUBSCRIPTION.CANCELLED": {
      const result = await query<LicenseRow>(
        `UPDATE licenses SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
         WHERE paypal_subscription_id = $1 RETURNING *`,
        [subscriptionId],
      );

      if (result.rows.length === 0) {
        console.warn(
          `[webhook] No license found for cancelled sub ${subscriptionId}`,
        );
        res.status(404).json({ error: "License not found for subscription" });
        return;
      }

      console.log(`[webhook] Cancelled license for sub ${subscriptionId}`);
      res.json(result.rows[0]);
      return;
    }

    case "BILLING.SUBSCRIPTION.SUSPENDED": {
      const result = await query<LicenseRow>(
        `UPDATE licenses SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
         WHERE paypal_subscription_id = $1 RETURNING *`,
        [subscriptionId],
      );

      if (result.rows.length === 0) {
        console.warn(
          `[webhook] No license found for suspended sub ${subscriptionId}`,
        );
        res.status(404).json({ error: "License not found for subscription" });
        return;
      }

      console.log(`[webhook] Suspended license for sub ${subscriptionId}`);
      res.json(result.rows[0]);
      return;
    }

    case "BILLING.SUBSCRIPTION.EXPIRED": {
      const result = await query<LicenseRow>(
        `UPDATE licenses SET status = 'expired', updated_at = NOW()
         WHERE paypal_subscription_id = $1 RETURNING *`,
        [subscriptionId],
      );

      if (result.rows.length === 0) {
        console.warn(
          `[webhook] No license found for expired sub ${subscriptionId}`,
        );
        res.status(404).json({ error: "License not found for subscription" });
        return;
      }

      console.log(`[webhook] Expired license for sub ${subscriptionId}`);
      res.json(result.rows[0]);
      return;
    }

    default: {
      console.log(`[webhook] Unhandled event type: ${eventType}`);
      res.json({ received: true, event_type: eventType });
      return;
    }
  }
});
