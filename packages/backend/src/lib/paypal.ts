/**
 * PayPal webhook signature verification helper.
 *
 * Uses the PayPal REST API v1 `/notifications/verify-webhook-signature`
 * endpoint to validate incoming webhook events.  When credentials are
 * missing the module logs a warning and — in sandbox mode — allows the
 * request through so local development is unblocked.
 */

/** Shape of the PayPal OAuth2 token response. */
interface PayPalTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/** Shape of the PayPal verification response. */
interface PayPalVerifyResponse {
  verification_status: "SUCCESS" | "FAILURE";
}

let cachedToken: { token: string; expiresAt: number } | null = null;

function getBaseUrl(): string {
  const mode = process.env.PAYPAL_MODE || "sandbox";
  return mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

function isSandbox(): boolean {
  return (process.env.PAYPAL_MODE || "sandbox") !== "live";
}

/**
 * Obtain a PayPal access token (cached until ~60 s before expiry).
 *
 * @throws {Error} when PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are unset
 */
export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(`${getBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal token request failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as PayPalTokenResponse;
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return data.access_token;
}

/**
 * Verify a PayPal webhook signature by calling the PayPal API.
 *
 * Returns `true` when verified, `false` otherwise.  In sandbox mode the
 * function is lenient: missing credentials or failed verification are
 * logged as warnings but still return `true`.
 */
export async function verifyWebhookSignature(
  headers: Record<string, string | string[] | undefined>,
  rawBody: string,
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.warn("[paypal] PAYPAL_WEBHOOK_ID not set — skipping verification");
    return isSandbox();
  }

  const h = (name: string): string | undefined => {
    const val = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(val) ? val[0] : val;
  };

  const transmissionId = h("paypal-transmission-id");
  const transmissionTime = h("paypal-transmission-time");
  const certUrl = h("paypal-cert-url");
  const authAlgo = h("paypal-auth-algo");
  const transmissionSig = h("paypal-transmission-sig");

  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    console.warn("[paypal] Missing required webhook verification headers");
    return isSandbox();
  }

  try {
    const token = await getAccessToken();

    const verifyPayload = {
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: webhookId,
      webhook_event: JSON.parse(rawBody),
    };

    const res = await fetch(`${getBaseUrl()}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(verifyPayload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn(`[paypal] Webhook verification request failed (${res.status}): ${text}`);
      return isSandbox();
    }

    const data = (await res.json()) as PayPalVerifyResponse;
    if (data.verification_status !== "SUCCESS") {
      console.warn(`[paypal] Webhook verification failed: ${data.verification_status}`);
      return isSandbox();
    }

    return true;
  } catch (err) {
    console.error("[paypal] Webhook verification error:", err);
    return isSandbox();
  }
}
