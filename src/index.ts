#!/usr/bin/env node
/**
 * Airtho MCP Server
 *
 * Provides authenticated Microsoft Graph API access to Airtho's SharePoint/OneDrive.
 * Transport is selected via the TRANSPORT environment variable:
 *   - TRANSPORT=http  → StreamableHTTP (default for Azure Container Apps)
 *   - TRANSPORT=stdio → stdio (for local Claude Desktop / Claude Code integration)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express, { Request, Response } from "express";
import { registerTools } from "./tools/index.js";

const REQUIRED_ENV = ["TENANT_ID", "CLIENT_ID", "CLIENT_SECRET"] as const;

function validateEnv(): void {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`ERROR: Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }
}

function createMcpServer(): McpServer {
  const server = new McpServer({ name: "airtho-mcp-server", version: "1.0.0" });
  registerTools(server);
  return server;
}

// ── HTTP transport (for Azure Container Apps) ──────────────────────────────────
async function runHttp(): Promise<void> {
  const app = express();
  app.use(express.json());

  // Each POST creates a fresh stateless server — no session state needed
  app.post("/mcp", async (req: Request, res: Response) => {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true,
    });

    res.on("close", () => {
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // Stateless mode — no SSE sessions or DELETE needed
  app.get("/mcp", (_req: Request, res: Response) => {
    res.status(405).json({ error: "SSE sessions not supported in stateless mode — use POST" });
  });

  app.delete("/mcp", (_req: Request, res: Response) => {
    res.status(405).json({ error: "Session management not supported in stateless mode" });
  });

  // Health probe for Azure Container Apps / load balancers
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  const port = parseInt(process.env.PORT ?? "3000", 10);
  app.listen(port, () => {
    console.error(`Airtho MCP server (HTTP) listening on port ${port} — endpoint: /mcp`);
  });
}

// ── stdio transport (for local Claude Desktop / Claude Code) ──────────────────
async function runStdio(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Airtho MCP server running via stdio");
}

// ── Entry point ───────────────────────────────────────────────────────────────
validateEnv();

const transportMode = process.env.TRANSPORT ?? "http";

if (transportMode === "stdio") {
  runStdio().catch((err: unknown) => {
    console.error("Server error:", err);
    process.exit(1);
  });
} else {
  runHttp().catch((err: unknown) => {
    console.error("Server error:", err);
    process.exit(1);
  });
}
