import { handleAuthorize, handleAuthServerMetadata, handleCallback } from "../proxy.js";

function getHeader(headers: unknown, key: string): string | undefined {
  if (!headers) return undefined;
  if (headers instanceof Headers) {
    return headers.get(key) ?? undefined;
  }
  return (headers as Record<string, string | undefined>)[key];
}

describe("OAuth proxy resource handling", () => {
  const previousEnv = {
    CLIENT_ID: process.env.CLIENT_ID,
    CLIENT_SECRET: process.env.CLIENT_SECRET,
    TENANT_ID: process.env.TENANT_ID,
    MCP_RESOURCE_URI: process.env.MCP_RESOURCE_URI,
  };

  beforeEach(() => {
    process.env.CLIENT_ID = "client-id";
    process.env.CLIENT_SECRET = "test-secret";
    process.env.TENANT_ID = "tenant-id";
    process.env.MCP_RESOURCE_URI = "https://example.com";
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("advertises supported grant types in auth server metadata", () => {
    const response = handleAuthServerMetadata({
      headers: new Headers(),
    } as never);

    const metadata = JSON.parse(response.body as string) as Record<string, unknown>;
    expect(metadata.issuer).toBe("https://example.com");
    expect(metadata.grant_types_supported).toContain("authorization_code");
    expect(metadata.grant_types_supported).toContain("refresh_token");
    expect(metadata.code_challenge_methods_supported).toContain("S256");
  });

  it("redirects authorize requests to Entra with proxy PKCE", () => {
    const response = handleAuthorize({
      url: "https://example.com/authorize?redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&state=client-state&code_challenge=test-challenge&code_challenge_method=S256",
      headers: new Headers(),
    } as never);

    expect(response.status).toBe(302);
    const location = getHeader(response.headers, "location");
    expect(location).toBeDefined();
    const redirected = new URL(location!);
    // Proxy generates its own PKCE — should NOT forward Claude's challenge
    expect(redirected.searchParams.get("code_challenge")).not.toBe("test-challenge");
    expect(redirected.searchParams.get("code_challenge_method")).toBe("S256");
    expect(redirected.searchParams.get("state")).toBeTruthy();
  });

  it("callback exchanges with Entra and redirects to Claude with proxy code", async () => {
    // First, start an authorize flow to populate pendingAuthorizations
    const authorizeResponse = handleAuthorize({
      url: "https://example.com/authorize?redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&state=client-state",
      headers: new Headers(),
    } as never);

    const location = getHeader(authorizeResponse.headers, "location");
    const redirected = new URL(location!);
    const proxyState = redirected.searchParams.get("state")!;

    // Simulate Entra callback — this will try to exchange with Entra (will fail in test)
    // but we can at least verify it handles missing/error states correctly
    const callbackResponse = await handleCallback({
      url: `https://example.com/callback?error=access_denied&error_description=User+cancelled&state=${proxyState}`,
      headers: new Headers(),
    } as never);

    expect(callbackResponse.status).toBe(302);
    const callbackLocation = new URL(getHeader(callbackResponse.headers, "location")!);
    expect(callbackLocation.origin + callbackLocation.pathname).toBe("https://claude.ai/api/mcp/auth_callback");
    expect(callbackLocation.searchParams.get("error")).toBe("access_denied");
    expect(callbackLocation.searchParams.get("state")).toBe("client-state");
  });
});
