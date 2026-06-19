import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetMergedPRs } from "./tools/get-merged-prs.js";
import { registerGenerateChangelog } from "./tools/generate-changelog.js";
import { registerPostChangelog } from "./tools/post-changelog.js";
import { validateLicense } from "./license.js";

/**
 * Creates and configures the Mergenote MCP server with all three tools.
 */
export async function createServer(): Promise<McpServer> {
  await validateLicense();

  const server = new McpServer({
    name: "mergenote",
    version: "1.0.0",
  });

  registerGetMergedPRs(server);
  registerGenerateChangelog(server);
  registerPostChangelog(server);

  return server;
}
