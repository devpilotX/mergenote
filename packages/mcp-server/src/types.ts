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
}

export interface LicenseStatus {
  valid: boolean;
  tier: "free" | "pro" | "team";
  email?: string;
  expires_at?: string;
}

export type ChangelogTemplate = "keepachangelog" | "minimal" | "custom";

export type PostAction = "file" | "pull_request" | "github_release";

export interface ChangelogSection {
  heading: string;
  items: PullRequest[];
}
