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
    TENANT_ID: process.env.TENANT_ID,
    MCP_RESOURCE_URI: process.env.MCP_RESOURCE_URI,
  };

  beforeEach(() => {
    process.env.CLIENT_ID = "client-id";
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

  it("advertises resource parameter support in auth server metadata", () => {
    const response = handleAuthServerMetadata({
      headers: new Headers(),
    } as never);

    const metadata = JSON.parse(response.body as string) as Record<string, unknown>;
    expect(metadata.resource_parameter_supported).toBe(true);
    expect(metadata.issuer).toBe("https://example.com");
  });

  it("defaults authorize requests to the canonical /mcp resource", () => {
    const response = handleAuthorize({
      url: "https://example.com/authorize?redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&state=client-state",
      headers: new Headers(),
    } as never);

    expect(response.status).toBe(302);
    const location = getHeader(response.headers, "location");
    expect(location).toBeDefined();
    const redirected = new URL(location!);
    expect(redirected.searchParams.get("state")).toBeTruthy();

    const callbackResponse = handleCallback({
      url: `https://example.com/callback?code=entra-code&state=${redirected.searchParams.get("state")}`,
      headers: new Headers(),
    } as never);

    expect(callbackResponse.status).toBe(302);
    const callbackLocation = new URL(getHeader(callbackResponse.headers, "location")!);
    expect(callbackLocation.origin + callbackLocation.pathname).toBe("https://claude.ai/api/mcp/auth_callback");
    expect(callbackLocation.searchParams.get("code")).toBeTruthy();
    expect(callbackLocation.searchParams.get("state")).toBe("client-state");
  });

  it("preserves an explicit resource parameter through the authorization flow", () => {
    const response = handleAuthorize({
      url: "https://example.com/authorize?redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&resource=https%3A%2F%2Fexample.com%2Fcustom-mcp&state=client-state",
      headers: new Headers(),
    } as never);

    expect(response.status).toBe(302);
    const location = getHeader(response.headers, "location");
    expect(location).toBeDefined();
    const redirected = new URL(location!);

    const callbackResponse = handleCallback({
      url: `https://example.com/callback?code=entra-code&state=${redirected.searchParams.get("state")}`,
      headers: new Headers(),
    } as never);

    expect(callbackResponse.status).toBe(302);
    const callbackLocation = new URL(getHeader(callbackResponse.headers, "location")!);
    expect(callbackLocation.searchParams.get("code")).toBeTruthy();
  });
});
