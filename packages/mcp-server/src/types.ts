/**
 * Shared types for the Mergenote MCP server.
 */

export interface PullRequest {
  number: number;
  title: string;
  author: string;
  labels: string[];
  merged_at: string;
  body: string;
  // Canonical GitHub URL of the pull request, e.g.
  // https://github.com/owner/repo/pull/123. Optional so callers can still
  // pass PRs inline without it.
  url?: string;
}

export interface LicenseStatus {
  valid: boolean;
  tier: "free" | "premium";
  email?: string;
  expires_at?: string;
}

export type ChangelogTemplate = "keepachangelog" | "minimal" | "custom";

export type PostAction = "file" | "pull_request" | "github_release";

export interface ChangelogSection {
  heading: string;
  items: PullRequest[];
}
