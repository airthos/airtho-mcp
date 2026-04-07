import { buildProtectedResourceMetadata } from "../metadata.js";

describe("buildProtectedResourceMetadata", () => {
  const previousClientId = process.env.CLIENT_ID;

  beforeEach(() => {
    process.env.CLIENT_ID = "test-client-id";
  });

  afterAll(() => {
    if (previousClientId === undefined) {
      delete process.env.CLIENT_ID;
      return;
    }
    process.env.CLIENT_ID = previousClientId;
  });

  it("returns the canonical MCP resource URI and separate auth server issuer", () => {
    const metadata = buildProtectedResourceMetadata(
      "https://example.com/mcp",
      "https://example.com",
    );

    expect(metadata).toEqual({
      resource: "https://example.com/mcp",
      authorization_servers: ["https://example.com"],
      bearer_methods_supported: ["header"],
      scopes_supported: ["api://test-client-id/mcp.access"],
    });
  });
});
