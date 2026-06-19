/**
 * Express server entry point for the Mergenote licensing backend.
 *
 * Wires up middleware (JSON body parser, CORS, request logging) and mounts
 * the license CRUD, license API (validate/status), PayPal webhook, and
 * health-check routers.
 */

import "dotenv/config";
import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { licensesRouter } from "./routes/licenses.js";
import { licenseApiRouter } from "./routes/license-api.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { subscribeRouter } from "./routes/subscribe.js";
import { errorHandler } from "./middleware/error-handler.js";

const PORT = parseInt(process.env.PORT ?? process.env.BACKEND_PORT ?? "3100", 10);
const HOST = process.env.HOST ?? "localhost";

// -- App setup ----------------------------------------------------------------

export const app: Express = express();

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3200", credentials: true }));
app.use(cookieParser());

// Capture raw body for webhook signature verification
app.use("/api/webhooks", express.json({
  verify: (req, _res, buf) => {
    (req as unknown as Record<string, Buffer>).rawBody = buf;
  },
}));
app.use(express.json());

// Request logging
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// -- Routes -------------------------------------------------------------------

app.use(healthRouter);

// Public config for frontend (PayPal client ID, plan IDs)
app.get("/api/config", (_req, res) => {
  res.json({
    paypalClientId: process.env.PAYPAL_CLIENT_ID || "",
    paypalPlanIdPro: process.env.PAYPAL_PLAN_ID_PRO || "",
    paypalPlanIdTeam: process.env.PAYPAL_PLAN_ID_TEAM || "",
  });
});

app.use("/api/auth", authRouter);
app.use("/api/subscribe", subscribeRouter);
app.use("/api/licenses", licensesRouter);
app.use("/api/license", licenseApiRouter);
app.use("/api/webhooks", webhooksRouter);

// -- Error handling -----------------------------------------------------------

app.use(errorHandler);

// -- Startup ------------------------------------------------------------------

// Warn about missing PayPal credentials but do not prevent startup.
if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
  console.warn(
    "[startup] PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not set - " +
      "PayPal webhook verification will be skipped",
  );
}

const server = app.listen(PORT, HOST, () => {
  console.log(
    `[startup] Mergenote licensing backend listening on http://${HOST}:${PORT}`,
  );
});

export { server };
