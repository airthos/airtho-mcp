/**
 * Opaque session token cache.
 *
 * Instead of passing raw Entra JWTs to Claude, we store them server-side
 * and return an opaque UUID session ID. Claude sends this ID as its Bearer
 * token; we look up the real Entra token for OBO Graph calls.
 *
 * This pattern matches Microsoft's APIM reference implementation and avoids
 * issues with Claude's MCP client rejecting or mishandling Entra JWTs.
 */

import { randomUUID } from "node:crypto";

export interface CachedSession {
  /** The real Entra ID access token (for OBO Graph calls) */
  accessToken: string;
  /** Entra refresh token (for token renewal) */
  refreshToken?: string;
  /** When the Entra access token expires (epoch ms) */
  expiresAt: number;
}

const sessions = new Map<string, CachedSession>();

// Cleanup expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt < now) sessions.delete(id);
  }
}, 5 * 60_000).unref();

/**
 * Create a new session from an Entra token response.
 * Returns the opaque session ID to send to the client.
 */
export function createSession(entraTokenResponse: {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}): string {
  const sessionId = randomUUID();
  sessions.set(sessionId, {
    accessToken: entraTokenResponse.access_token,
    refreshToken: entraTokenResponse.refresh_token as string | undefined,
    expiresAt: Date.now() + entraTokenResponse.expires_in * 1000 - 60_000, // 1 min buffer
  });
  return sessionId;
}

/**
 * Look up a session by opaque token.
 * Returns the cached Entra token or null if expired/unknown.
 */
export function resolveSession(bearerToken: string): CachedSession | null {
  const session = sessions.get(bearerToken);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(bearerToken);
    return null;
  }
  return session;
}
