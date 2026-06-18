/**
 * Health-check route.
 *
 * GET /health → `{ status: "ok", timestamp: "…" }`
 */

import { Router } from "express";
import type { Request, Response, Router as IRouter } from "express";

export const healthRouter: IRouter = Router();

healthRouter.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});
