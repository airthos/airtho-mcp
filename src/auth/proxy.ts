/**
 * OAuth 2.1 Proxy — bridges Claude's OAuth client to Entra ID.
 *
 * Simplified (softeria-style) approach: return raw Entra tokens directly
 * to Claude. No proxy JWT, no session storage. Stateless after /token completes.
 *
 * Flow:
 *   1. Claude → POST /register       → proxy returns a client_id
 *   2. Claude → GET  /authorize       → proxy stores dual PKCE, redirects to Entra
 *   3. User   → signs in at Entra     → Entra redirects to GET /callback
 *   4. Server → GET  /callback        → exchanges Entra code immediately, stores tokens
 *                                        briefly, redirects to Claude with proxy code
 *   5. Claude → POST /token           → proxy validates PKCE, returns raw Entra tokens
 *
 * Token validation on subsequent requests: the raw Entra access_token is passed
 * directly as Bearer — tool handlers use it for OBO Graph calls.
 */

import { HttpRequest, HttpResponseInit } from "@azure/functions";
import { randomUUID, createHash, randomBytes } from "node:crypto";

/**
 * Safely extract the user principal name from a JWT payload for logging only.
 * Never used for authorization decisions — just to correlate App Insights traces.
 */
function peekUpn(token: string): string {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) as Record<string, unknown>;
    return (payload.preferred_username ?? payload.upn ?? payload.unique_name ?? "unknown") as string;
  } catch {
    return "unknown";
  }
}

// ── In-memory stores ───────────────────────────────────────────────────────────

/**
 * Pending authorization flows: proxyState → flow metadata.
 * Lives between /authorize and /callback (seconds, during Entra login).
 */
const pendingAuthorizations = new Map<string, {
  clientRedirectUri: string;
  /** Claude's PKCE challenge (validated at /token) */
  codeChallenge?: string;
  codeChallengeMethod?: string;
  /** Claude's original state (round-tripped back) */
  clientState?: string;
  scope?: string;
  /** Proxy's PKCE verifier (sent to Entra at callback exchange) */
  proxyCodeVerifier: string;
  expiresAt: number;
}>();

/**
 * Completed auth flows: proxyCode → Entra tokens + PKCE challenge.
 * Lives between /callback and /token (milliseconds — Claude calls immediately).
 */
const completedExchanges = new Map<string, {
  entraAccessToken: string;
  entraRefreshToken?: string;
  entraExpiresIn: number;
  entraScope: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  expiresAt: number;
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

function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

function computeS256Challenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function validatePkce(codeVerifier: string, codeChallenge: string, method = "S256"): boolean {
  if (method === "S256") return computeS256Challenge(codeVerifier) === codeChallenge;
  if (method === "plain") return codeVerifier === codeChallenge;
  return false;
}

function cleanupExpired(): void {
  const now = Date.now();
  for (const [k, v] of pendingAuthorizations) { if (v.expiresAt < now) pendingAuthorizations.delete(k); }
  for (const [k, v] of completedExchanges) { if (v.expiresAt < now) completedExchanges.delete(k); }
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
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
      scopes_supported: [
        `api://${process.env.CLIENT_ID!}/mcp.access`,
        "openid",
        "profile",
        "email",
        "offline_access",
      ],
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

  console.log("[OAuth Proxy] DCR register request:", JSON.stringify(body));

  const redirectUris = (body.redirect_uris as string[]) ?? [];
  const clientName = (body.client_name as string) ?? "Claude";
  const requestedAuthMethod = (body.token_endpoint_auth_method as string) ?? "none";

  return {
    status: 201,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: randomUUID(),
      client_name: clientName,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: requestedAuthMethod,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: (body.scope as string) ?? `api://${process.env.CLIENT_ID!}/mcp.access offline_access`,
    }),
  };
}

// ── Authorization Endpoint ─────────────────────────────────────────────────────

export function handleAuthorize(request: HttpRequest): HttpResponseInit {
  console.log("[OAuth Proxy] Authorize request:", request.url);
  cleanupExpired();

  const url = new URL(request.url);
  const clientRedirectUri = url.searchParams.get("redirect_uri") ?? "";
  const codeChallenge = url.searchParams.get("code_challenge") ?? undefined;
  const codeChallengeMethod = url.searchParams.get("code_challenge_method") ?? undefined;
  const clientState = url.searchParams.get("state") ?? undefined;
  const scope = url.searchParams.get("scope") ?? undefined;

  // Generate proxy's own PKCE pair for the Entra leg (dual PKCE)
  const proxyCodeVerifier = generateCodeVerifier();
  const proxyCodeChallenge = computeS256Challenge(proxyCodeVerifier);

  const proxyState = randomUUID();
  pendingAuthorizations.set(proxyState, {
    clientRedirectUri,
    codeChallenge,
    codeChallengeMethod,
    clientState,
    scope,
    proxyCodeVerifier,
    expiresAt: Date.now() + 600_000, // 10 minutes
  });

  const baseUrl = getBaseUrl(request);
  const entraParams = new URLSearchParams({
    client_id: process.env.CLIENT_ID!,
    response_type: "code",
    redirect_uri: `${baseUrl}/callback`,
    scope: `api://${process.env.CLIENT_ID!}/mcp.access offline_access openid profile`,
    state: proxyState,
    response_mode: "query",
    code_challenge: proxyCodeChallenge,
    code_challenge_method: "S256",
  });

  return {
    status: 302,
    headers: { location: `${entraAuthorizeUrl()}?${entraParams.toString()}` },
  };
}

// ── Callback (from Entra ID after user login) ──────────────────────────────────

export async function handleCallback(request: HttpRequest): Promise<HttpResponseInit> {
  const url = new URL(request.url);
  const entraCode = url.searchParams.get("code");
  const proxyState = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  // Log safe fields only — never log the Entra auth code
  console.log(`[OAuth Proxy] Callback: state=${proxyState?.slice(0, 8) ?? "none"}… hasCode=${!!entraCode} error=${error ?? "none"}`);

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
    const redirectUrl = new URL(pending.clientRedirectUri);
    redirectUrl.searchParams.set("error", error ?? "server_error");
    if (errorDescription) redirectUrl.searchParams.set("error_description", errorDescription);
    if (pending.clientState) redirectUrl.searchParams.set("state", pending.clientState);
    return { status: 302, headers: { location: redirectUrl.toString() } };
  }

  // Exchange Entra code immediately (not deferred to /token)
  const baseUrl = getBaseUrl(request);
  const entraParams = new URLSearchParams({
    client_id: process.env.CLIENT_ID!,
    client_secret: process.env.CLIENT_SECRET!,
    grant_type: "authorization_code",
    code: entraCode,
    redirect_uri: `${baseUrl}/callback`,
    code_verifier: pending.proxyCodeVerifier,
  });

  const entraResponse = await fetch(entraTokenUrl(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: entraParams.toString(),
  });

  const entraResult = await entraResponse.json() as Record<string, unknown>;
  console.log(`[OAuth Proxy] Entra token exchange: status=${entraResponse.status}`);

  if (!entraResponse.ok) {
    // Log only the error code/description — never the full response (may contain hints)
    console.log(`[OAuth Proxy] Entra token error: ${entraResult.error} — ${entraResult.error_description}`);
    const redirectUrl = new URL(pending.clientRedirectUri);
    redirectUrl.searchParams.set("error", "server_error");
    redirectUrl.searchParams.set("error_description",
      `Entra exchange failed: ${entraResult.error_description ?? entraResult.error ?? "unknown"}`);
    if (pending.clientState) redirectUrl.searchParams.set("state", pending.clientState);
    return { status: 302, headers: { location: redirectUrl.toString() } };
  }

  const accessToken = entraResult.access_token as string;
  const refreshToken = entraResult.refresh_token as string | undefined;
  const expiresIn = (entraResult.expires_in as number) ?? 3600;
  const entraScope = (entraResult.scope as string) ?? `api://${process.env.CLIENT_ID!}/mcp.access`;

  const upn = peekUpn(accessToken);
  console.log(`[OAuth Proxy] Entra exchange succeeded: user=${upn} expires_in=${expiresIn} has_refresh=${!!refreshToken}`);

  // Store briefly for /token to consume (Claude calls /token within seconds)
  const proxyCode = randomUUID();
  completedExchanges.set(proxyCode, {
    entraAccessToken: accessToken,
    entraRefreshToken: refreshToken,
    entraExpiresIn: expiresIn,
    entraScope,
    codeChallenge: pending.codeChallenge,
    codeChallengeMethod: pending.codeChallengeMethod,
    expiresAt: Date.now() + 300_000, // 5 minutes
  });

  // Redirect back to Claude with the proxy code
  const redirectUrl = new URL(pending.clientRedirectUri);
  redirectUrl.searchParams.set("code", proxyCode);
  if (pending.clientState) redirectUrl.searchParams.set("state", pending.clientState);
  return { status: 302, headers: { location: redirectUrl.toString() } };
}

// ── Token Endpoint ─────────────────────────────────────────────────────────────

export async function handleToken(request: HttpRequest): Promise<HttpResponseInit> {
  let params: URLSearchParams;
  try {
    const text = await request.text();
    params = new URLSearchParams(text);
    // Log only non-secret fields — never log code, code_verifier, or refresh_token values
    console.log(`[OAuth Proxy] Token request: grant_type=${params.get("grant_type")} has_code=${params.has("code")} has_verifier=${params.has("code_verifier")} has_refresh=${params.has("refresh_token")}`);
  } catch {
    return {
      status: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "invalid_request" }),
    };
  }

  const grantType = params.get("grant_type");

  // ── authorization_code grant ───────────────────────────────────────────────
  if (grantType === "authorization_code") {
    const proxyCode = params.get("code");
    const codeVerifier = params.get("code_verifier") ?? undefined;

    if (!proxyCode || !completedExchanges.has(proxyCode)) {
      return {
        status: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "invalid_grant", error_description: "Unknown or expired authorization code" }),
      };
    }

    const exchange = completedExchanges.get(proxyCode)!;
    completedExchanges.delete(proxyCode); // consume-once

    if (exchange.expiresAt < Date.now()) {
      return {
        status: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "invalid_grant", error_description: "Authorization code expired" }),
      };
    }

    // Validate Claude's PKCE
    if (exchange.codeChallenge && codeVerifier) {
      if (!validatePkce(codeVerifier, exchange.codeChallenge, exchange.codeChallengeMethod)) {
        return {
          status: 400,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: "invalid_grant", error_description: "PKCE verification failed" }),
        };
      }
    }

    console.log(`[OAuth Proxy] Token issued: user=${peekUpn(exchange.entraAccessToken)} expires_in=${exchange.entraExpiresIn}`);

    const tokenResponse: Record<string, unknown> = {
      access_token: exchange.entraAccessToken,
      token_type: "Bearer",
      expires_in: exchange.entraExpiresIn,
      scope: exchange.entraScope,
    };

    if (exchange.entraRefreshToken) {
      tokenResponse.refresh_token = exchange.entraRefreshToken;
    }

    return {
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(tokenResponse),
    };
  }

  // ── refresh_token grant ────────────────────────────────────────────────────
  if (grantType === "refresh_token") {
    const refreshToken = params.get("refresh_token");
    if (!refreshToken) {
      return {
        status: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "invalid_grant", error_description: "refresh_token required" }),
      };
    }

    // Forward directly to Entra — stateless, no server-side storage needed
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

    if (!entraResponse.ok) {
      console.log(`[OAuth Proxy] Entra refresh error: ${entraResult.error} — ${entraResult.error_description}`);
      return {
        status: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "invalid_grant", error_description: "Token refresh failed" }),
      };
    }

    const newAccessToken = entraResult.access_token as string;
    console.log(`[OAuth Proxy] Token refreshed: user=${peekUpn(newAccessToken)} expires_in=${entraResult.expires_in}`);

    const tokenResponse: Record<string, unknown> = {
      access_token: newAccessToken,
      token_type: "Bearer",
      expires_in: entraResult.expires_in,
      scope: entraResult.scope,
    };

    if (entraResult.refresh_token) {
      tokenResponse.refresh_token = entraResult.refresh_token;
    }

    return {
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(tokenResponse),
    };
  }

  return {
    status: 400,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ error: "unsupported_grant_type" }),
  };
}
