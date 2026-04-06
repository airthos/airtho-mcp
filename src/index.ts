/**
 * Airtho MCP Server — Azure Functions v4 with MCP SDK (Web Standard transport)
 *
 * Serves the MCP protocol over Streamable HTTP with per-user OAuth 2.1
 * authentication via Entra ID. Each Claude.ai user authenticates with
 * their Microsoft account; Graph API calls run under their identity
 * via the On-Behalf-Of (OBO) flow.
 *
 * Uses the MCP SDK's WebStandardStreamableHTTPServerTransport which works
 * natively with Azure Functions v4's Web API Request/Response — no Express
 * adapter or fake stream objects needed.
 *
 * Local dev:  func start  →  http://localhost:7071/mcp
 * Deployed:   https://<app>.azurewebsites.net/mcp
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { randomUUID } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer } from "./mcp-server.js";
import { extractBearerToken, validateToken } from "./auth/validate-jwt.js";
import { buildProtectedResourceMetadata } from "./auth/metadata.js";
import { runWithToken } from "./auth/token-store.js";
import {
  handleAuthServerMetadata,
  handleRegister,
  handleAuthorize,
  handleCallback,
  handleToken,
} from "./auth/proxy.js";
import "./favicon.js";

// ── Env validation ────────────────────────────────────────────────────────────
const REQUIRED_ENV = ["TENANT_ID", "CLIENT_ID", "CLIENT_SECRET"] as const;
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

const REQUIRE_AUTH = process.env.REQUIRE_AUTH !== "false";

// ── MCP session management ────────────────────────────────────────────────────
const sessions = new Map<string, WebStandardStreamableHTTPServerTransport>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function getResourceUrl(request: HttpRequest): string {
  return process.env.MCP_RESOURCE_URI
    ?? `${request.headers.get("x-forwarded-proto") || "https"}://${request.headers.get("host")}`;
}

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): HttpResponseInit {
  return {
    status,
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  };
}

/**
 * Validate the Bearer token on the request.
 * Returns the raw token string (for OBO) or null (unauthenticated).
 * Returns an HttpResponseInit if auth fails (send it back directly).
 */
async function authenticate(request: HttpRequest): Promise<string | null | HttpResponseInit> {
  const raw = extractBearerToken(request.headers.get("authorization"));
  console.log("[Auth] Method:", request.method, "Path:", new URL(request.url).pathname, "Has token:", !!raw);

  if (!raw && REQUIRE_AUTH) {
    console.log("[Auth] No token, returning 401");
    const resourceUrl = getResourceUrl(request);
    return {
      status: 401,
      headers: {
        "content-type": "application/json",
        "www-authenticate": `Bearer realm="mcp", resource_metadata="${resourceUrl}/.well-known/oauth-protected-resource"`,
      },
      body: JSON.stringify({ error: "unauthorized", message: "Bearer token required" }),
    };
  }

  if (raw) {
    const claims = await validateToken(raw);
    console.log("[Auth] Token validation result:", claims ? `OK (${claims.preferred_username})` : "FAILED");
    if (!claims) {
      return jsonResponse({ error: "invalid_token", message: "Token validation failed" }, 401);
    }
    return raw;
  }

  return null; // No token, auth not required (local dev)
}

// ── RFC 9728 — Protected Resource Metadata ────────────────────────────────────

app.http("wellKnown", {
  methods: ["GET"],
  route: ".well-known/oauth-protected-resource",
  authLevel: "anonymous",
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    return jsonResponse(buildProtectedResourceMetadata(getResourceUrl(request)));
  },
});

// ── RFC 8414 — Authorization Server Metadata ──────────────────────────────────

app.http("authServerMetadata", {
  methods: ["GET"],
  route: ".well-known/oauth-authorization-server",
  authLevel: "anonymous",
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    return handleAuthServerMetadata(request);
  },
});

// ── OAuth Proxy Endpoints ─────────────────────────────────────────────────────

app.http("oauthRegister", {
  methods: ["POST"],
  route: "register",
  authLevel: "anonymous",
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    return handleRegister(request);
  },
});

app.http("oauthAuthorize", {
  methods: ["GET"],
  route: "authorize",
  authLevel: "anonymous",
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    return handleAuthorize(request);
  },
});

app.http("oauthCallback", {
  methods: ["GET"],
  route: "callback",
  authLevel: "anonymous",
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    return handleCallback(request);
  },
});

app.http("oauthToken", {
  methods: ["POST"],
  route: "token",
  authLevel: "anonymous",
  handler: async (request: HttpRequest): Promise<HttpResponseInit> => {
    return handleToken(request);
  },
});

// ── MCP endpoint (POST / GET / DELETE) ────────────────────────────────────────

app.http("mcp", {
  methods: ["GET", "POST", "DELETE"],
  route: "mcp",
  authLevel: "anonymous",
  handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
    // ── Auth ──────────────────────────────────────────────────────────────
    const authResult = await authenticate(request);
    if (authResult !== null && typeof authResult === "object" && "status" in authResult) {
      return authResult; // Auth failure response
    }
    const userToken = typeof authResult === "string" ? authResult : undefined;

    // ── Read body once (stream can only be consumed once) ────────────────
    const rawBody = (request.method === "POST" || request.method === "PUT")
      ? await request.text().catch(() => "")
      : "";

    // ── Convert Azure Functions HttpRequest → Web Standard Request ─────
    const url = request.url;
    const headers = new Headers();
    request.headers.forEach((value, key) => headers.set(key, value));

    const webRequest = rawBody
      ? new Request(url, { method: request.method, headers, body: rawBody })
      : new Request(url, { method: request.method, headers });

    // ── Route by method ───────────────────────────────────────────────────
    const sessionId = request.headers.get("mcp-session-id") ?? undefined;

    if (request.method === "POST") {
      let parsedBody: unknown;
      try {
        parsedBody = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        return jsonResponse(
          { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null },
          400,
        );
      }

      let transport: WebStandardStreamableHTTPServerTransport;

      if (sessionId && sessions.has(sessionId)) {
        transport = sessions.get(sessionId)!;
      } else if (!sessionId && isInitializeRequest(parsedBody)) {
        // New session
        transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            sessions.set(sid, transport);
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) sessions.delete(sid);
        };

        const server = createMcpServer();
        await server.connect(transport);
      } else {
        return jsonResponse(
          { jsonrpc: "2.0", error: { code: -32000, message: "Invalid or missing session" }, id: null },
          400,
        );
      }

      // Run the MCP handler with the user token in async context
      const webResponse = await runWithToken(userToken, () =>
        transport.handleRequest(webRequest, { parsedBody }),
      );

      return convertWebResponse(webResponse);
    }

    if (request.method === "GET") {
      if (!sessionId || !sessions.has(sessionId)) {
        return jsonResponse({ error: "invalid_session" }, 400);
      }
      const webResponse = await runWithToken(userToken, () =>
        sessions.get(sessionId)!.handleRequest(webRequest),
      );
      return convertWebResponse(webResponse);
    }

    if (request.method === "DELETE") {
      if (sessionId && sessions.has(sessionId)) {
        const webResponse = await runWithToken(userToken, () =>
          sessions.get(sessionId)!.handleRequest(webRequest),
        );
        return convertWebResponse(webResponse);
      }
      return jsonResponse({ error: "invalid_session" }, 400);
    }

    return jsonResponse({ error: "method_not_allowed" }, 405);
  },
});

/**
 * Convert a Web Standard Response to Azure Functions HttpResponseInit.
 */
async function convertWebResponse(webResponse: Response): Promise<HttpResponseInit> {
  const headers: Record<string, string> = {};
  webResponse.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const body = await webResponse.text().catch(() => "");

  return {
    status: webResponse.status,
    headers,
    body: body || undefined,
  };
}
