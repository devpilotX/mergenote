import { Router } from "express";
import type { Request, Response, Router as IRouter } from "express";
import jwt from "jsonwebtoken";
import { query } from "../lib/db.js";

export const authRouter: IRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || "mergenote-dev-secret";
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3200";

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

/** GET /api/auth/github — Redirect to GitHub OAuth */
authRouter.get("/github", (_req: Request, res: Response) => {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    scope: "read:user user:email",
    redirect_uri: `${FRONTEND_URL}/auth/callback`,
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

/** GET /api/auth/callback — Exchange code for token, create/update user, set JWT cookie */
authRouter.get("/callback", async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;
  if (!code) { res.status(400).json({ error: "Missing code" }); return; }

  // Exchange code for access token
  const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET, code }),
  });
  const tokenData = await tokenResp.json() as { access_token?: string; error?: string };
  if (!tokenData.access_token) { res.status(401).json({ error: "GitHub OAuth failed" }); return; }

  // Get GitHub user
  const userResp = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/json" },
  });
  const ghUser = await userResp.json() as GitHubUser;

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

  // Sign JWT
  const token = jwt.sign({ userId: user.id, githubLogin: user.github_login }, JWT_SECRET, { expiresIn: "7d" });

  // Set cookie and redirect to dashboard
  res.cookie("token", token, { httpOnly: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000, path: "/" });
  res.redirect(`${FRONTEND_URL}/dashboard`);
});

/** GET /api/auth/me — Get current user from JWT cookie */
authRouter.get("/me", async (req: Request, res: Response) => {
  const token = req.cookies?.token;
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; githubLogin: string };
    const userResult = await query<UserRow>(
      `SELECT * FROM users WHERE id = $1`, [payload.userId],
    );
    if (userResult.rows.length === 0) { res.status(401).json({ error: "User not found" }); return; }
    const user = userResult.rows[0];

    // Get license info
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
