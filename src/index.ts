import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono } from "hono";

import { AppConfig } from "./config";
import { AppRuntime } from "./layers/AppLayer";
import { registerTools } from "./handlers/mcp-handlers";
import { Effect } from "effect";

const app = new Hono();

// Health check endpoint
app.get("/", (c) => {
  return c.text("NS MCP Server is running");
});

// Create MCP server
const mcpServer = new McpServer({
  name: "ns-mcp-server",
  version: "1.0.0",
});

// Register tools with runtime
registerTools(mcpServer, AppRuntime.runPromise);

// Initialize the transport
const transport = new StreamableHTTPTransport();

// MCP endpoint
app.all("/mcp", async (c) => {
  if (!mcpServer.isConnected()) {
    await mcpServer.connect(transport);
  }
  return transport.handleRequest(c);
});

// Start server with logging
await AppRuntime.runPromise(
  Effect.gen(function* () {
    const config = yield* AppConfig;
    yield* Effect.logInfo(`Starting NS MCP Server on port ${config.port}...`);

    Bun.serve({
      port: config.port,
      fetch(req) {
        return app.fetch(req);
      },
    });

    yield* Effect.logInfo(`NS MCP Server running on http://localhost:${config.port}`);
  })
);
