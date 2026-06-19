import { Router } from "express";
import type { Request, Response, Router as IRouter } from "express";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { query } from "../lib/db.js";

export const authRouter: IRouter = Router();

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3200";
const BACKEND_PORT = process.env.BACKEND_PORT || "3100";
const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${BACKEND_PORT}`;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("[auth] FATAL: JWT_SECRET env var is required");
  process.exit(1);
}

// In-memory state store (short-lived CSRF tokens)
const pendingStates = new Map<string, number>();

// Clean expired states every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of pendingStates) {
    if (now - ts > 10 * 60 * 1000) pendingStates.delete(key);
  }
}, 5 * 60 * 1000).unref();

interface GitHubUser {
  id: number;
  login: string;
  email: string | null;
  avatar_url: string;
}

interface UserRow {
  id: string;
  github_id: number;
  github_login: string;
  email: string | null;
  avatar_url: string | null;
}

/** GET /api/auth/github — Redirect to GitHub OAuth with CSRF state */
authRouter.get("/github", (_req: Request, res: Response) => {
  const state = crypto.randomBytes(16).toString("hex");
  pendingStates.set(state, Date.now());

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    scope: "read:user user:email",
    redirect_uri: `${BACKEND_URL}/api/auth/callback`,
    state,
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

/** GET /api/auth/callback — Exchange code, set cookie, redirect to frontend dashboard */
authRouter.get("/callback", async (req: Request, res: Response) => {
  try {
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;

    // Validate state (CSRF)
    if (!state || !pendingStates.has(state)) {
      res.redirect(`${FRONTEND_URL}/dashboard?error=invalid_state`);
      return;
    }
    pendingStates.delete(state);

    if (!code) {
      res.redirect(`${FRONTEND_URL}/dashboard?error=missing_code`);
      return;
    }

    // Exchange code for access token
    const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET, code }),
    });
    const tokenData = (await tokenResp.json()) as { access_token?: string; error?: string };
    if (!tokenData.access_token) {
      res.redirect(`${FRONTEND_URL}/dashboard?error=oauth_failed`);
      return;
    }

    // Get GitHub user
    const userResp = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/json" },
    });
    const ghUser = (await userResp.json()) as GitHubUser;

    // Upsert user in DB
    const result = await query<UserRow>(
      `INSERT INTO users (github_id, github_login, email, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (github_id) DO UPDATE SET
         github_login = EXCLUDED.github_login,
         email = EXCLUDED.email,
         avatar_url = EXCLUDED.avatar_url,
         updated_at = NOW()
       RETURNING *`,
      [ghUser.id, ghUser.login, ghUser.email, ghUser.avatar_url],
    );
    const user = result.rows[0];

    // Sign JWT and set cookie
    const token = jwt.sign({ userId: user.id, githubLogin: user.github_login }, JWT_SECRET!, { expiresIn: "7d" });
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    res.redirect(`${FRONTEND_URL}/dashboard`);
  } catch (err) {
    console.error("[auth] OAuth callback error:", err);
    res.redirect(`${FRONTEND_URL}/dashboard?error=server_error`);
  }
});

/** GET /api/auth/me — Get current user from JWT cookie */
authRouter.get("/me", async (req: Request, res: Response) => {
  const token = req.cookies?.token;
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }

  try {
    const payload = jwt.verify(token, JWT_SECRET!) as { userId: string; githubLogin: string };
    const userResult = await query<UserRow>(
      `SELECT * FROM users WHERE id = $1`, [payload.userId],
    );
    if (userResult.rows.length === 0) { res.status(401).json({ error: "User not found" }); return; }
    const user = userResult.rows[0];

    const licenseResult = await query(
      `SELECT license_key, tier, status FROM licenses WHERE user_id = $1 AND status = 'active' LIMIT 1`,
      [user.id],
    );
    const license = licenseResult.rows[0] || null;

    res.json({ user: { id: user.id, github_login: user.github_login, email: user.email, avatar_url: user.avatar_url }, license });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

/** POST /api/auth/logout — Clear cookie */
authRouter.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("token", { path: "/" });
  res.json({ ok: true });
});
