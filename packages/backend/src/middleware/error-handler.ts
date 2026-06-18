/**
 * Centralised Express error-handling middleware.
 *
 * Catches errors forwarded via `next(err)` (or thrown from async route
 * handlers in Express 5) and returns a consistent JSON error envelope.
 */

import type { Request, Response, NextFunction } from "express";

/** Error shape that may carry an HTTP status code. */
export interface HttpError extends Error {
  status?: number;
  statusCode?: number;
}

/**
 * Global error handler — must be registered with all four parameters so
 * Express recognises it as an error-handling middleware.
 */
export function errorHandler(
  err: HttpError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const status = err.status ?? err.statusCode ?? 500;
  const message = status === 500 ? "Internal server error" : err.message;

  if (status === 500) {
    console.error("[error]", err);
  }

  res.status(status).json({ error: message });
}
