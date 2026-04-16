/**
 * RFC 9728 — OAuth 2.0 Protected Resource Metadata.
 *
 * Returns a JSON document that tells MCP clients (Claude) where and how
 * to obtain access tokens for this server. Points to ourselves as the
 * authorization server — we proxy OAuth requests to Entra ID.
 *
 * Endpoint: GET /.well-known/oauth-protected-resource
 */

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  bearer_methods_supported: string[];
  scopes_supported: string[];
  resource_documentation?: string;
}

/**
 * Build the protected resource metadata document.
 *
 * @param baseUrl - Server base URL, e.g. "https://airtho-mcp.azurewebsites.net"
 *                  Used as both the `resource` identifier and the authorization server.
 *                  (Profility uses base URL, not the /mcp path, for the resource field.)
 */
export function buildProtectedResourceMetadata(baseUrl: string): ProtectedResourceMetadata {
  return {
    resource: baseUrl,
    authorization_servers: [baseUrl],
    bearer_methods_supported: ["header"],
    scopes_supported: [
      `api://${process.env.CLIENT_ID!}/mcp.access`,
      "openid",
      "profile",
      "email",
    ],
  };
}
