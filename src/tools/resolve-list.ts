import { getGraphClient } from "../graph/client.js";
import type { GraphList, McpError } from "../types.js";

export interface ResolvedList {
  _listId: string;
  listDisplayName: string;
}

type ListEntry = {
  _id: string;
  name: string;
  nameLower: string;
  displayName: string;
  displayNameLower: string;
};

/** Cache keyed by siteId — lists don't change often. */
const _listCache = new Map<string, ListEntry[]>();

/** Exported for tests only — resets the module-level cache. */
export function _resetListCache(): void {
  _listCache.clear();
}

async function loadLists(siteId: string): Promise<ListEntry[]> {
  if (_listCache.has(siteId)) return _listCache.get(siteId)!;

  const client = getGraphClient();
  const response = (await client
    .api(`/sites/${siteId}/lists?$select=id,name,displayName`)
    .get()) as { value: GraphList[] };

  const entries = (response.value ?? []).map((l) => ({
    _id: l.id,
    name: l.name,
    nameLower: l.name.toLowerCase(),
    displayName: l.displayName,
    displayNameLower: l.displayName.toLowerCase(),
  }));

  _listCache.set(siteId, entries);
  return entries;
}

/**
 * Resolve a human-readable list name to a Graph list ID.
 * Matches displayName first (case-insensitive), then internal name.
 * Returns McpError if not found.
 */
export async function resolveList(
  siteId: string,
  listName: string
): Promise<ResolvedList | McpError> {
  try {
    const lists = await loadLists(siteId);
    const key = listName.toLowerCase();
    const match =
      lists.find((l) => l.displayNameLower === key) ??
      lists.find((l) => l.nameLower === key);

    if (!match) {
      const available = lists.map((l) => l.displayName).join(", ");
      return {
        error: "list_not_found",
        message: `No list named '${listName}'. Available lists: ${available}`,
      };
    }

    return { _listId: match._id, listDisplayName: match.displayName };
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode === 403) {
      return {
        error: "forbidden",
        message: "Access denied to site lists. Ensure the app has Sites.Read.All permission.",
      };
    }
    return { error: "graph_error", message: e.message ?? String(err) };
  }
}
