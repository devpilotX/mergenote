#!/usr/bin/env node

/**
 * Mergenote MCP Server - stdio transport entry point.
 *
 * Usage:
 *   npx @mergenote/mcp-server
 *   node dist/index.js
 */

import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const server = await createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Mergenote MCP server running on stdio");
}

// Graceful shutdown
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

main().catch((err) => {
  console.error("Fatal error starting Mergenote MCP server:", err);
  process.exit(1);
});
