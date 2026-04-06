/**
 * On-Behalf-Of (OBO) token exchange.
 *
 * Exchanges a user's Bearer token (from Claude.ai) for a Microsoft Graph
 * access token that acts as that user. SharePoint permissions are fully
 * enforced — each user sees only what they have access to.
 *
 * Uses @azure/identity OnBehalfOfCredential which handles caching and
 * refresh internally.
 */

import { OnBehalfOfCredential } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js";

const GRAPH_SCOPES = ["https://graph.microsoft.com/.default"];

/**
 * Create a Microsoft Graph client that acts as a specific user via OBO flow.
 *
 * @param userAssertion - The Bearer token from the incoming MCP request
 *                        (issued by Entra ID, audience = our CLIENT_ID)
 */
export function getGraphClientForUser(userAssertion: string): Client {
  const tenantId = process.env.TENANT_ID!;
  const clientId = process.env.CLIENT_ID!;
  const clientSecret = process.env.CLIENT_SECRET!;

  const credential = new OnBehalfOfCredential({
    tenantId,
    clientId,
    clientSecret,
    userAssertionToken: userAssertion,
  });

  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: GRAPH_SCOPES,
  });

  return Client.initWithMiddleware({ authProvider });
}

/**
 * Get a bearer token string (for direct fetch() calls) acting as the user.
 */
export async function getBearerTokenForUser(userAssertion: string): Promise<string> {
  const tenantId = process.env.TENANT_ID!;
  const clientId = process.env.CLIENT_ID!;
  const clientSecret = process.env.CLIENT_SECRET!;

  const credential = new OnBehalfOfCredential({
    tenantId,
    clientId,
    clientSecret,
    userAssertionToken: userAssertion,
  });

  const token = await credential.getToken(GRAPH_SCOPES);
  if (!token) throw new Error("OBO token exchange failed");
  return token.token;
}
