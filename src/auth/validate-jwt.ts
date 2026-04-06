/**
 * JWT validation for incoming Bearer tokens from Claude.ai MCP requests.
 *
 * Validates tokens against Entra ID (Azure AD) JWKS endpoint. The token's
 * audience must match our app registration CLIENT_ID, and the issuer must
 * match our TENANT_ID.
 */

import jwt from "jsonwebtoken";
import jwksRsa from "jwks-rsa";

export interface UserClaims {
  /** Entra object ID */
  oid: string;
  /** User principal name (email), e.g. brendan@airtho.com */
  preferred_username: string;
  /** Display name */
  name?: string;
  /** Subject identifier */
  sub: string;
  /** Token scopes (space-separated string) */
  scp?: string;
}

let _jwksClient: jwksRsa.JwksClient | null = null;

function getJwksClient(): jwksRsa.JwksClient {
  if (!_jwksClient) {
    const tenantId = process.env.TENANT_ID;
    if (!tenantId) throw new Error("TENANT_ID is required for JWT validation");

    _jwksClient = jwksRsa({
      jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/keys`,
      cache: true,
      cacheMaxAge: 600_000, // 10 minutes
      rateLimit: true,
    });
  }
  return _jwksClient;
}

function getSigningKey(header: jwt.JwtHeader): Promise<string> {
  return new Promise((resolve, reject) => {
    getJwksClient().getSigningKey(header.kid, (err, key) => {
      if (err) return reject(err);
      if (!key) return reject(new Error("No signing key found"));
      resolve(key.getPublicKey());
    });
  });
}

/**
 * Validate a Bearer token from an incoming request.
 * Returns user claims on success, null on failure.
 */
export async function validateToken(token: string): Promise<UserClaims | null> {
  const tenantId = process.env.TENANT_ID;
  const clientId = process.env.CLIENT_ID;
  if (!tenantId || !clientId) return null;

  try {
    // Decode header first to get kid for key lookup
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === "string") return null;

    const signingKey = await getSigningKey(decoded.header);

    const verified = jwt.verify(token, signingKey, {
      algorithms: ["RS256"],
      issuer: [
        `https://login.microsoftonline.com/${tenantId}/v2.0`,
        `https://sts.windows.net/${tenantId}/`,
      ],
      audience: [clientId, `api://${clientId}`],
    }) as jwt.JwtPayload;

    return {
      oid: verified.oid as string,
      preferred_username: (verified.preferred_username ?? verified.upn ?? "") as string,
      name: verified.name as string | undefined,
      sub: verified.sub as string,
      scp: verified.scp as string | undefined,
    };
  } catch (err) {
    console.log("[JWT] Validation error:", (err as Error).message);
    return null;
  }
}

/**
 * Extract Bearer token from an Authorization header value.
 * Returns the raw token string or null.
 */
export function extractBearerToken(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}
