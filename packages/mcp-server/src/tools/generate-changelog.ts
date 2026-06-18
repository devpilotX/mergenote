import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { groupPRs, renderChangelog, renderSmartChangelog } from "../templates.js";
import type { PullRequest, ChangelogTemplate } from "../types.js";

const prSchema = z.object({
  number: z.number(),
  title: z.string(),
  author: z.string(),
  labels: z.array(z.string()),
  merged_at: z.string(),
  body: z.string().optional().default(""),
});

const inputSchema = {
  prs: z
    .array(prSchema)
    .describe(
      "Array of PR objects from get_merged_prs output, or provided inline"
    ),
  style: z
    .enum(["smart", "raw"])
    .default("smart")
    .describe("'smart' (default): filters noise, groups by meaning, includes rewrite prompt for the AI. 'raw': mechanical grouping with raw PR titles."),
  template: z
    .enum(["keepachangelog", "minimal", "custom"])
    .default("keepachangelog")
    .describe("Changelog format template (only used in raw mode)"),
  version: z
    .string()
    .optional()
    .describe('Version string, e.g. "v2.4.0"'),
  date: z
    .string()
    .optional()
    .describe("Release date in YYYY-MM-DD format. Defaults to today"),
  custom_sections: z
    .record(z.array(z.string()))
    .optional()
    .describe(
      "Custom section mapping (raw mode only): keys are section headings, values are arrays of label patterns"
    ),
  include_internal: z
    .boolean()
    .default(false)
    .describe("Whether to include the Internal section in the output (raw mode only)"),
};

export function registerGenerateChangelog(server: McpServer): void {
  server.tool(
    "generate_changelog",
    "Group merged PRs by category and generate a formatted changelog in markdown",
    inputSchema,
    async (args) => {
      try {
        const {
          prs,
          style,
          template,
          version,
          date,
          custom_sections,
          include_internal,
        } = args;

        const resolvedVersion = version ?? "Unreleased";
        const resolvedDate =
          date ?? new Date().toISOString().slice(0, 10);

        const typedPRs: PullRequest[] = prs.map((pr) => ({
          ...pr,
          body: pr.body ?? "",
        }));

        // Smart mode: filter noise, group by meaning, include rewrite prompt
        if (style === "smart") {
          const changelog = renderSmartChangelog(typedPRs, resolvedVersion, resolvedDate);
          return { content: [{ type: "text", text: changelog }] };
        }

        // Raw mode: original mechanical grouping
        const sections = groupPRs(
          typedPRs,
          include_internal,
          custom_sections
        );

        if (sections.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No categorized changes found. All PRs may have been filtered out.",
              },
            ],
          };
        }

        const changelog = renderChangelog(
          sections,
          template as ChangelogTemplate,
          resolvedVersion,
          resolvedDate
        );

        return {
          content: [{ type: "text", text: changelog }],
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text",
              text: `Error generating changelog: ${message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
