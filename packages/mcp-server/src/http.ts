/**
 * Mergenote MCP Server -- Streamable HTTP transport entry point.
 *
 * Usage:
 *   node dist/http.js
 *
 * Starts an HTTP server on PORT (default 3300) that speaks the MCP
 * Streamable HTTP transport protocol.
 */

import "dotenv/config";
import { createServer as createHttpServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";

const PORT = parseInt(process.env.MCP_HTTP_PORT ?? "3300", 10);

async function main(): Promise<void> {
  const mcpServer = await createServer();

  const httpServer = createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

    // Health check
    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    // MCP endpoint
    if (url.pathname === "/mcp") {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res);
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  httpServer.listen(PORT, () => {
    console.error(`Mergenote MCP HTTP server listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error("Fatal error starting Mergenote MCP HTTP server:", err);
  process.exit(1);
});
