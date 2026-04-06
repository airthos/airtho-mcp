import { ClientSecretCredential } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js";
import {
  getGraphClientForUser as oboGraphClient,
  getBearerTokenForUser as oboBearerToken,
} from "../auth/obo.js";

let _credential: ClientSecretCredential | null = null;
let _client: Client | null = null;

function getCredential(): ClientSecretCredential {
  if (!_credential) {
    const tenantId = process.env.TENANT_ID;
    const clientId = process.env.CLIENT_ID;
    const clientSecret = process.env.CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
      throw new Error(
        "Missing required env vars: TENANT_ID, CLIENT_ID, CLIENT_SECRET"
      );
    }

    _credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  }
  return _credential;
}

/**
 * Get a Graph client — per-user (OBO) if a token is provided,
 * otherwise falls back to the shared service account (local dev).
 */
export function getGraphClient(userToken?: string): Client {
  if (userToken) {
    return oboGraphClient(userToken);
  }

  // Fallback: service account singleton (client credentials)
  if (!_client) {
    const authProvider = new TokenCredentialAuthenticationProvider(
      getCredential(),
      { scopes: ["https://graph.microsoft.com/.default"] }
    );
    _client = Client.initWithMiddleware({ authProvider });
  }
  return _client;
}

/**
 * Returns a bearer token for direct fetch() calls (e.g. file content download).
 * Per-user (OBO) if a token is provided, otherwise service account.
 */
export async function getBearerToken(userToken?: string): Promise<string> {
  if (userToken) {
    return oboBearerToken(userToken);
  }

  const token = await getCredential().getToken(
    "https://graph.microsoft.com/.default"
  );
  if (!token) throw new Error("Failed to acquire access token");
  return token.token;
}
