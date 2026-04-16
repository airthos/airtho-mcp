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

  it("returns the base URL as resource and authorization server", () => {
    const metadata = buildProtectedResourceMetadata("https://example.com");

    expect(metadata).toEqual({
      resource: "https://example.com",
      authorization_servers: ["https://example.com"],
      bearer_methods_supported: ["header"],
      scopes_supported: [
        "api://test-client-id/mcp.access",
        "openid",
        "profile",
        "email",
      ],
    });
  });
});
