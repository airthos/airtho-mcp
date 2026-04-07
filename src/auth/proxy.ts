/**
 * OAuth 2.1 Proxy — bridges Claude's OAuth client to Entra ID.
 *
 * Claude (web and desktop) expects the MCP server to be its own authorization
 * server with DCR support. Entra ID doesn't support DCR. This proxy accepts
 * Claude's OAuth requests and proxies them to Entra ID using our pre-registered
 * app credentials.
 *
 * Flow:
 *   Claude → POST /register        → we return our client_id
 *   Claude → GET  /authorize        → we redirect to Entra ID login
 *   User   → signs in at Entra      → Entra redirects to GET /callback
 *   Server → GET  /callback         → we redirect back to Claude with auth code
 *   Claude → POST /token            → we exchange code with Entra, return token
 *
 * The token Claude receives is an opaque session ID (UUID), not the raw
 * Entra JWT. The real Entra token is cached server-side and used for OBO
 * Graph calls when Claude sends the session ID as a Bearer token.
 */

import { HttpRequest, HttpResponseInit } from "@azure/functions";
import { randomUUID, createHash } from "node:crypto";
import { createSession } from "./sessions.js";

// ── In-memory stores (per worker instance) ────────────────────────────────────

/** Maps our proxy auth codes to Entra auth codes + metadata. */
const pendingCodes = new Map<string, {
  entraCode: string;
  redirectUri: string;
  resource: string;
  codeVerifier?: string;
  expiresAt: number;
}>();

/** Maps state → { clientRedirectUri, codeChallenge, codeChallengeMethod } for the authorize flow. */
const pendingAuthorizations = new Map<string, {
  clientRedirectUri: string;
  resource: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  clientState?: string;
  scope?: string;
}>();

/** DCR client registrations — maps client_id → client metadata. */
const registeredClients = new Map<string, {
  client_id: string;
  redirect_uris: string[];
  client_name?: string;
}>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function getBaseUrl(request: HttpRequest): string {
  return process.env.MCP_RESOURCE_URI
    ?? `${request.headers.get("x-forwarded-proto") || "https"}://${request.headers.get("host")}`;
}

function entraAuthorizeUrl(): string {
  return `https://login.microsoftonline.com/${process.env.TENANT_ID!}/oauth2/v2.0/authorize`;
}

function entraTokenUrl(): string {
  return `https://login.microsoftonline.com/${process.env.TENANT_ID!}/oauth2/v2.0/token`;
}

function canonicalResourceUrl(request: HttpRequest): string {
  return `${getBaseUrl(request).replace(/\/$/, "")}/mcp`;
}

// ── RFC 8414 — Authorization Server Metadata ──────────────────────────────────

export function handleAuthServerMetadata(request: HttpRequest): HttpResponseInit {
  const baseUrl = getBaseUrl(request);
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/authorize`,
      token_endpoint: `${baseUrl}/token`,
      registration_endpoint: `${baseUrl}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256", "plain"],
      token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
      resource_parameter_supported: true,
      scopes_supported: ["openid", "profile", "email", "offline_access"],
    }),
  };
}

// ── Dynamic Client Registration (DCR) ─────────────────────────────────────────

export async function handleRegister(request: HttpRequest): Promise<HttpResponseInit> {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return {
      status: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "invalid_request", error_description: "Invalid JSON body" }),
    };
  }

  // Log what Claude sends for debugging
  console.log("[OAuth Proxy] DCR register request:", JSON.stringify(body));

  // Accept whatever Claude sends, return our pre-registered Entra client_id
  const clientId = process.env.CLIENT_ID!;
  const redirectUris = (body.redirect_uris as string[]) ?? [];
  const clientName = (body.client_name as string) ?? "Claude";

  const registration = {
    client_id: clientId,
    redirect_uris: redirectUris,
    client_name: clientName,
  };

  registeredClients.set(clientId, registration);

  // Mirror back what Claude requested. Include a client_secret since Claude
  // registered with token_endpoint_auth_method: "client_secret_post".
  const requestedAuthMethod = (body.token_endpoint_auth_method as string) ?? "client_secret_post";
  const clientSecret = process.env.CLIENT_SECRET!;

  return {
    status: 201,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      client_name: clientName,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: requestedAuthMethod,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: (body.scope as string) ?? `api://${clientId}/mcp.access offline_access`,
    }),
  };
}

// ── Authorization Endpoint ────────────────────────────────────────────────────

export function handleAuthorize(request: HttpRequest): HttpResponseInit {
  console.log("[OAuth Proxy] Authorize request:", request.url);
  const url = new URL(request.url);
  const clientRedirectUri = url.searchParams.get("redirect_uri") ?? "";
  const resource = url.searchParams.get("resource") ?? canonicalResourceUrl(request);
  const codeChallenge = url.searchParams.get("code_challenge") ?? undefined;
  const codeChallengeMethod = url.searchParams.get("code_challenge_method") ?? undefined;
  const clientState = url.searchParams.get("state") ?? undefined;
  const scope = url.searchParams.get("scope") ?? undefined;

  // Generate a state token to track this authorization flow
  const proxyState = randomUUID();
  pendingAuthorizations.set(proxyState, {
    clientRedirectUri,
    resource,
    codeChallenge,
    codeChallengeMethod,
    clientState,
    scope,
  });

  // Clean up expired entries (older than 10 minutes)
  const now = Date.now();
  for (const [key, val] of pendingCodes) {
    if (val.expiresAt < now) pendingCodes.delete(key);
  }

  // Build Entra ID authorization URL
  const baseUrl = getBaseUrl(request);
  const entraParams = new URLSearchParams({
    client_id: process.env.CLIENT_ID!,
    response_type: "code",
    redirect_uri: `${baseUrl}/callback`,
    scope: `api://${process.env.CLIENT_ID!}/mcp.access offline_access openid profile`,
    state: proxyState,
    response_mode: "query",
  });

  // Forward PKCE to Entra if provided
  if (codeChallenge) {
    entraParams.set("code_challenge", codeChallenge);
    if (codeChallengeMethod) {
      entraParams.set("code_challenge_method", codeChallengeMethod);
    }
  }

  return {
    status: 302,
    headers: { location: `${entraAuthorizeUrl()}?${entraParams.toString()}` },
  };
}

// ── Callback (from Entra ID after user login) ─────────────────────────────────

export function handleCallback(request: HttpRequest): HttpResponseInit {
  console.log("[OAuth Proxy] Callback request:", request.url);
  const url = new URL(request.url);
  const entraCode = url.searchParams.get("code");
  const proxyState = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (!proxyState || !pendingAuthorizations.has(proxyState)) {
    return {
      status: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "invalid_state", message: "Unknown or expired authorization state" }),
    };
  }

  const pending = pendingAuthorizations.get(proxyState)!;
  pendingAuthorizations.delete(proxyState);

  if (error || !entraCode) {
    // Forward error back to Claude's redirect URI
    const redirectUrl = new URL(pending.clientRedirectUri);
    redirectUrl.searchParams.set("error", error ?? "server_error");
    if (errorDescription) redirectUrl.searchParams.set("error_description", errorDescription);
    if (pending.clientState) redirectUrl.searchParams.set("state", pending.clientState);
    return { status: 302, headers: { location: redirectUrl.toString() } };
  }

  // Generate a proxy auth code that maps to the Entra code
  const proxyCode = randomUUID();
  pendingCodes.set(proxyCode, {
    entraCode,
    redirectUri: pending.clientRedirectUri,
    resource: pending.resource,
    expiresAt: Date.now() + 600_000, // 10 minutes
  });

  // Redirect back to Claude with our proxy code
  const redirectUrl = new URL(pending.clientRedirectUri);
  redirectUrl.searchParams.set("code", proxyCode);
  if (pending.clientState) {
    redirectUrl.searchParams.set("state", pending.clientState);
  }

  return { status: 302, headers: { location: redirectUrl.toString() } };
}

// ── Token Endpoint ────────────────────────────────────────────────────────────

export async function handleToken(request: HttpRequest): Promise<HttpResponseInit> {
  let params: URLSearchParams;
  try {
    const text = await request.text();
    console.log("[OAuth Proxy] Token request body:", text);
    params = new URLSearchParams(text);
  } catch {
    return {
      status: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "invalid_request" }),
    };
  }

  const grantType = params.get("grant_type");
  const baseUrl = getBaseUrl(request);

  if (grantType === "authorization_code") {
    const proxyCode = params.get("code");
    const resource = params.get("resource");
    const codeVerifier = params.get("code_verifier") ?? undefined;

    if (!proxyCode || !pendingCodes.has(proxyCode)) {
      return {
        status: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "invalid_grant", error_description: "Unknown or expired authorization code" }),
      };
    }

    const pending = pendingCodes.get(proxyCode)!;
    pendingCodes.delete(proxyCode);

    if (pending.expiresAt < Date.now()) {
      return {
        status: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "invalid_grant", error_description: "Authorization code expired" }),
      };
    }

    if (resource && resource !== pending.resource) {
      return {
        status: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "invalid_target", error_description: "Requested resource does not match authorization" }),
      };
    }

    // Exchange the Entra auth code for tokens
    const entraParams = new URLSearchParams({
      client_id: process.env.CLIENT_ID!,
      client_secret: process.env.CLIENT_SECRET!,
      grant_type: "authorization_code",
      code: pending.entraCode,
      redirect_uri: `${baseUrl}/callback`,
    });
    if (codeVerifier) {
      entraParams.set("code_verifier", codeVerifier);
    }

    const entraResponse = await fetch(entraTokenUrl(), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: entraParams.toString(),
    });

    const entraResult = await entraResponse.json() as Record<string, unknown>;
    console.log("[OAuth Proxy] Entra token response:", entraResponse.status, JSON.stringify(entraResult));

    if (!entraResponse.ok) {
      console.log("[OAuth Proxy] Entra token error:", JSON.stringify(entraResult));
      return {
        status: entraResponse.status,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(entraResult),
      };
    }

    // Create an opaque session token — Claude gets a UUID, not the Entra JWT.
    // The real Entra token is cached server-side for OBO Graph calls.
    const sessionId = createSession({
      access_token: entraResult.access_token as string,
      refresh_token: entraResult.refresh_token as string | undefined,
      expires_in: entraResult.expires_in as number,
    });

    console.log("[OAuth Proxy] Created session, returning opaque token");

    return {
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        access_token: sessionId,
        token_type: "Bearer",
        expires_in: entraResult.expires_in,
        scope: entraResult.scope,
      }),
    };
  }

  if (grantType === "refresh_token") {
    const refreshToken = params.get("refresh_token");
    if (!refreshToken) {
      return {
        status: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "invalid_request", error_description: "Missing refresh_token" }),
      };
    }

    const entraParams = new URLSearchParams({
      client_id: process.env.CLIENT_ID!,
      client_secret: process.env.CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: `api://${process.env.CLIENT_ID!}/mcp.access offline_access openid profile`,
    });

    const entraResponse = await fetch(entraTokenUrl(), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: entraParams.toString(),
    });

    const entraResult = await entraResponse.json() as Record<string, unknown>;

    return {
      status: entraResponse.status,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(entraResult),
    };
  }

  return {
    status: 400,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ error: "unsupported_grant_type" }),
  };
}
