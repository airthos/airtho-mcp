/**
 * RFC 9728 — OAuth 2.0 Protected Resource Metadata.
 *
 * Returns a JSON document that tells MCP clients (Claude.ai) where and how
 * to obtain access tokens for this server. Claude.ai fetches this
 * automatically when a user adds the connector URL.
 *
 * Endpoint: GET /.well-known/oauth-protected-resource
 */

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  bearer_methods_supported: string[];
  scopes_supported: string[];
}

/**
 * Build the protected resource metadata document.
 *
 * @param resourceUrl - The public URL of this MCP server,
 *                      e.g. "https://airtho-mcp.azurewebsites.net"
 */
export function buildProtectedResourceMetadata(resourceUrl: string): ProtectedResourceMetadata {
  const tenantId = process.env.TENANT_ID!;

  return {
    resource: resourceUrl,
    authorization_servers: [
      `https://login.microsoftonline.com/${tenantId}/v2.0`,
    ],
    bearer_methods_supported: ["header"],
    scopes_supported: [
      `api://${process.env.CLIENT_ID!}/mcp.access`,
    ],
  };
}
