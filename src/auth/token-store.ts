/**
 * Per-request user token threading via AsyncLocalStorage.
 *
 * Express auth middleware stores the validated Bearer token, and
 * MCP tool handlers retrieve it — no explicit parameter passing
 * through the MCP SDK's transport layer.
 */

import { AsyncLocalStorage } from "node:async_hooks";

const store = new AsyncLocalStorage<string | undefined>();

/** Run a callback with a user token bound to the current async context. */
export function runWithToken<T>(token: string | undefined, fn: () => T): T {
  return store.run(token, fn);
}

/** Get the user token for the current request (undefined = unauthenticated / local dev). */
export function getUserToken(): string | undefined {
  return store.getStore();
}
