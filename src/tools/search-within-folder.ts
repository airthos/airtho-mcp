import { getGraphClient } from "../graph/client.js";
import type { GraphItem, McpError, SearchResult } from "../types.js";

export async function searchWithinFolder(args: {
  drive_id: string;
  item_id: string;
  query: string;
  limit?: number;
}): Promise<{ results: SearchResult[]; has_more: boolean; total_returned: number } | McpError> {
  const { drive_id, item_id, query, limit = 50 } = args;

  try {
    const client = getGraphClient();
    const response = await client
      .api(`/drives/${drive_id}/items/${item_id}/search(q='${encodeURIComponent(query)}')`)
      .top(limit)
      .get() as { value: GraphItem[] };

    const results = (response.value ?? []).map((item) => ({
      name: item.name,
      id: item.id,
      path: item.parentReference?.path ?? null,
      modified: item.lastModifiedDateTime ?? null,
      size: item.size ?? null,
    }));

    return { results, has_more: results.length === limit, total_returned: results.length };
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode === 404) {
      return { error: "item_not_found", message: `Folder '${item_id}' not found in drive '${drive_id}'` };
    }
    return { error: "graph_error", message: e.message ?? String(err) };
  }
}
