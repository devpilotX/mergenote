/**
 * PayPal webhook routes.
 *
 * Mounted at `/api/webhooks` by the main Express app.
 */

import { Router } from "express";
import type { Request, Response, Router as IRouter } from "express";
import { query } from "../lib/db.js";
import { generateLicenseKey } from "../lib/license-key.js";
import { verifyWebhookSignature } from "../lib/paypal.js";

export interface WebhookEvent {
  id: string;
  event_type: string;
  resource: {
    id: string;
    plan_id?: string;
    subscriber?: { email_address?: string; payer_id?: string };
    custom_id?: string;
    [key: string]: unknown;
  };
}

type Plan = "premium";

function planIdToTier(_planId: string | undefined): Plan {
  return "premium";
}

export const webhooksRouter: IRouter = Router();

webhooksRouter.post("/paypal", async (req: Request, res: Response) => {
  try {
    const rawBody = (
      (req as unknown as Record<string, Buffer>).rawBody ?? Buffer.from("")
    ).toString("utf-8");

    const verified = await verifyWebhookSignature(
      req.headers as Record<string, string | string[] | undefined>,
      rawBody,
    );
    if (!verified) {
      res.status(401).json({ error: "Webhook verification failed" });
      return;
    }

    const event: WebhookEvent = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { event_type: eventType, resource } = event;
    const subscriptionId = resource?.id;

    if (!subscriptionId) {
      res.status(400).json({ error: "Missing resource.id" });
      return;
    }

    console.log(`[webhook] ${eventType} for ${subscriptionId}`);

    switch (eventType) {
      case "BILLING.SUBSCRIPTION.ACTIVATED": {
        const email = resource.subscriber?.email_address || "unknown@paypal.com";
        const tier = planIdToTier(resource.plan_id);
        const userId = resource.custom_id || null; // passed from frontend createSubscription

        // Idempotent: if subscription already exists, update it to active
        const result = await query(
          `INSERT INTO licenses (license_key, email, tier, status, paypal_subscription_id, user_id)
           VALUES ($1, $2, $3, 'active', $4, $5)
           ON CONFLICT (paypal_subscription_id) DO UPDATE SET
             status = 'active', tier = EXCLUDED.tier, updated_at = NOW(), revoked_at = NULL
           RETURNING *`,
          [generateLicenseKey(), email, tier, subscriptionId, userId],
        );

        console.log(
          `[webhook] Activated ${tier} license for ${email} (sub: ${subscriptionId}, user: ${userId})`,
        );
        res.status(201).json(result.rows[0]);
        return;
      }

      case "BILLING.SUBSCRIPTION.CANCELLED":
      case "BILLING.SUBSCRIPTION.SUSPENDED": {
        await query(
          `UPDATE licenses SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
           WHERE paypal_subscription_id = $1`,
          [subscriptionId],
        );
        res.json({ received: true });
        return;
      }

      case "BILLING.SUBSCRIPTION.EXPIRED": {
        await query(
          `UPDATE licenses SET status = 'expired', updated_at = NOW()
           WHERE paypal_subscription_id = $1`,
          [subscriptionId],
        );
        res.json({ received: true });
        return;
      }

      default:
        res.json({ received: true, event_type: eventType });
    }
  } catch (err) {
    console.error("[webhook] Error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});
