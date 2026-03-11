/**
 * Airtho MCP Server — Azure Functions v4 + standalone MCP HTTP server
 *
 * The MCP server runs on its own port (MCP_PORT, default 3001) using
 * StreamableHTTPServerTransport directly with a real http.Server.
 * Each request gets a fresh McpServer + transport (stateless mode).
 *
 * For local dev / Inspector, connect to http://localhost:3001/mcp
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as http from "http";
import { registerTools } from "./tools/index.js";

// ── Env validation ────────────────────────────────────────────────────────────
const REQUIRED_ENV = ["TENANT_ID", "CLIENT_ID", "CLIENT_SECRET"] as const;
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

// ── Standalone HTTP server for MCP protocol ───────────────────────────────────
const mcpHttpServer = http.createServer(async (req, res) => {
  // CORS headers for Inspector / browser clients
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Collect request body
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const bodyStr = Buffer.concat(chunks).toString("utf8");
  const body = bodyStr ? JSON.parse(bodyStr) : undefined;

  // Fresh server + transport per request (stateless mode)
  const server = new McpServer({ name: "airtho-mcp-server", version: "1.0.0" });
  registerTools(server);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);

  try {
    await transport.handleRequest(req, res, body);
  } finally {
    try { await server.close(); } catch { /* ignore */ }
  }
});

const MCP_PORT = parseInt(process.env.MCP_PORT ?? "3001", 10);
mcpHttpServer.listen(MCP_PORT, () => {
  console.log(`MCP server listening on http://localhost:${MCP_PORT}/mcp`);
});

// ── Azure Function — health check / info endpoint ────────────────────────────
app.http("mcp", {
  methods: ["POST", "GET", "DELETE"],
  authLevel: "anonymous",
  route: "mcp",
  handler: async (_request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
    return {
      status: 200,
      jsonBody: {
        status: "ok",
        mcp_endpoint: `http://localhost:${MCP_PORT}/mcp`,
        message: "Connect your MCP client directly to the mcp_endpoint URL",
      },
    };
  },
});
