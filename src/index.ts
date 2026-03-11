/**
 * Airtho MCP Server — Azure Functions v4 HTTP trigger
 *
 * Each POST to /api/mcp is handled statelessly:
 *   1. Parse the MCP JSON-RPC body from the request
 *   2. Create a fresh McpServer + StreamableHTTPServerTransport
 *   3. Capture the JSON response via ResponseCapture
 *   4. Return it as an Azure Functions HttpResponseInit
 *
 * Local dev:  func start  →  http://localhost:7071/api/mcp
 * Deployed:   https://<function-app>.azurewebsites.net/api/mcp
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { IncomingMessage, ServerResponse } from "http";
import { Socket } from "net";
import { registerTools } from "./tools/index.js";

// ── Env validation — throws on cold start if misconfigured ────────────────────
const REQUIRED_ENV = ["TENANT_ID", "CLIENT_ID", "CLIENT_SECRET"] as const;
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

// ── MCP server factory ────────────────────────────────────────────────────────
function createMcpServer(): McpServer {
  const server = new McpServer({ name: "airtho-mcp-server", version: "1.0.0" });
  registerTools(server);
  return server;
}

/**
 * Minimal response capture for StreamableHTTPServerTransport with enableJsonResponse:true.
 * The transport only calls setHeader / writeHead / write / end — no streaming, no socket.
 */
class ResponseCapture {
  statusCode = 200;
  readonly headers: Record<string, string | string[]> = {};
  body = "";

  setHeader(name: string, value: string | string[]): void {
    this.headers[name.toLowerCase()] = value;
  }

  writeHead(status: number, headers?: Record<string, string>): void {
    this.statusCode = status;
    if (headers) {
      for (const [k, v] of Object.entries(headers)) this.setHeader(k, v);
    }
  }

  write(chunk: Buffer | string): boolean {
    this.body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
    return true;
  }

  end(chunk?: Buffer | string | (() => void)): this {
    if (typeof chunk === "function") chunk();
    else if (chunk != null) {
      this.body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
    }
    return this;
  }
}

// ── Azure Function HTTP trigger ───────────────────────────────────────────────
app.http("mcp", {
  methods: ["POST", "GET", "DELETE"],
  authLevel: "anonymous",
  route: "mcp",
  handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
    // Stateless mode — only POST is meaningful
    if (request.method !== "POST") {
      return {
        status: 405,
        jsonBody: { error: "Only POST is supported — stateless MCP over HTTP" },
      };
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: "Request body must be valid JSON" } };
    }

    // Build a minimal IncomingMessage so the transport can read method + headers
    const socket = new Socket();
    const fakeReq = new IncomingMessage(socket);
    fakeReq.method = request.method;
    request.headers.forEach((value, key) => {
      (fakeReq.headers as Record<string, string>)[key.toLowerCase()] = value;
    });

    const capture = new ResponseCapture();
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless — no session cookies
      enableJsonResponse: true,      // full JSON response, no SSE streaming
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(
        fakeReq,
        capture as unknown as ServerResponse,
        body,
      );
    } finally {
      // Best-effort cleanup — errors here don't affect the captured response
      try { await server.close(); } catch { /* ignore */ }
    }

    // Flatten multi-value headers for HttpResponseInit
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(capture.headers)) {
      headers[k] = Array.isArray(v) ? v.join(", ") : v;
    }

    return { status: capture.statusCode, headers, body: capture.body };
  },
});
