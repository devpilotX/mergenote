import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchMergedPRs, getTagDate } from "../github.js";
import { getLicenseStatus, isWithinFreeTierWindow } from "../license.js";

const FREE_TIER_UPGRADE_MSG =
  "⚡ Free tier is limited to a 7-day PR window.\n\n" +
  "Upgrade to Premium for unlimited history: https://devpilotx.com/pricing";

const inputSchema = {
  owner: z.string().describe("GitHub repo owner"),
  repo: z.string().describe("GitHub repo name"),
  from_tag: z
    .string()
    .optional()
    .describe('Start tag, e.g. "v1.0.0"'),
  to_tag: z
    .string()
    .optional()
    .describe('End tag, e.g. "v1.1.0". Defaults to HEAD'),
  from_date: z
    .string()
    .optional()
    .describe("Start date as ISO string"),
  to_date: z
    .string()
    .optional()
    .describe("End date as ISO string"),
  label_filter: z
    .array(z.string())
    .optional()
    .describe("Only include PRs that have at least one of these labels"),
};

export function registerGetMergedPRs(server: McpServer): void {
  server.tool(
    "get_merged_prs",
    "Fetch merged pull requests from a GitHub repo by tag range, date range, or default last 7 days",
    inputSchema,
    async (args) => {
      try {
        const { owner, repo, from_tag, to_tag, from_date, to_date, label_filter } =
          args;

        let since: Date;
        let until: Date;

        if (from_tag) {
          since = await getTagDate(owner, repo, from_tag);
          until = to_tag
            ? await getTagDate(owner, repo, to_tag)
            : new Date();
        } else if (from_date) {
          since = new Date(from_date);
          until = to_date ? new Date(to_date) : new Date();

          if (isNaN(since.getTime())) {
            return {
              content: [
                { type: "text", text: "Invalid from_date. Use ISO 8601 format." },
              ],
              isError: true,
            };
          }
          if (isNaN(until.getTime())) {
            return {
              content: [
                { type: "text", text: "Invalid to_date. Use ISO 8601 format." },
              ],
              isError: true,
            };
          }
        } else {
          // Default: last 7 days (always within free tier)
          until = new Date();
          since = new Date(until.getTime() - 7 * 24 * 60 * 60 * 1000);
        }

        // Gate: free tier limited to 7-day window
        const { tier } = getLicenseStatus();
        if (tier === "free" && !isWithinFreeTierWindow(since, until)) {
          return {
            content: [{ type: "text", text: FREE_TIER_UPGRADE_MSG }],
            isError: true,
          };
        }

        const prs = await fetchMergedPRs(owner, repo, since, until, label_filter);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(prs, null, 2),
            },
          ],
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);

        if (message.includes("rate limit") || message.includes("403")) {
          return {
            content: [
              {
                type: "text",
                text: `GitHub API rate limit exceeded. Try again later or use a token with higher limits. Details: ${message}`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [{ type: "text", text: `Error fetching PRs: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
