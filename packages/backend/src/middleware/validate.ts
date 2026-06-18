/**
 * Lightweight request-body validation middleware.
 *
 * Validates that required fields exist on `req.body` and that they match
 * the expected types.  Returns a 400 JSON response on the first violation.
 */

import type { Request, Response, NextFunction } from "express";

/** A single field validation rule. */
export interface FieldRule {
  /** Name of the field on `req.body`. */
  name: string;
  /** Expected `typeof` result (e.g. `"string"`, `"number"`). */
  type: string;
  /** When `true` the field must be present and non-empty (for strings). */
  required?: boolean;
  /** Optional whitelist of accepted values. */
  oneOf?: readonly unknown[];
}

/**
 * Return Express middleware that validates `req.body` against the supplied
 * rules.  Calls `next()` when all rules pass, otherwise responds with
 * `400 { error: "…" }`.
 *
 * @example
 * ```ts
 * router.post(
 *   "/",
 *   validateBody([
 *     { name: "owner_email", type: "string", required: true },
 *     { name: "plan", type: "string", oneOf: ["free", "pro", "team"] },
 *   ]),
 *   createLicense,
 * );
 * ```
 */
export function validateBody(rules: FieldRule[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const body = req.body as Record<string, unknown> | undefined;

    if (!body || typeof body !== "object") {
      res.status(400).json({ error: "Request body must be a JSON object" });
      return;
    }

    for (const rule of rules) {
      const value = body[rule.name];

      if (rule.required) {
        if (value === undefined || value === null) {
          res
            .status(400)
            .json({ error: `Field '${rule.name}' is required` });
          return;
        }
        if (rule.type === "string" && (value as string) === "") {
          res
            .status(400)
            .json({ error: `Field '${rule.name}' must not be empty` });
          return;
        }
      }

      // Only type-check when a value is actually present
      if (value !== undefined && value !== null) {
        if (typeof value !== rule.type) {
          res.status(400).json({
            error: `Field '${rule.name}' must be of type ${rule.type}`,
          });
          return;
        }

        if (rule.oneOf && !rule.oneOf.includes(value)) {
          res.status(400).json({
            error: `Field '${rule.name}' must be one of: ${rule.oneOf.join(", ")}`,
          });
          return;
        }
      }
    }

    next();
  };
}

/**
 * Validate that `req.params[paramName]` is present and non-empty.
 */
export function validateParam(paramName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = req.params[paramName];
    const strValue = Array.isArray(value) ? value[0] : value;
    if (!strValue || strValue.trim() === "") {
      res
        .status(400)
        .json({ error: `URL parameter '${paramName}' is required` });
      return;
    }
    next();
  };
}

