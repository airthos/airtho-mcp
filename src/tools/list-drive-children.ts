import { getGraphClient } from "../graph/client.js";
import type { DriveItem, GraphItem, McpError } from "../types.js";

export async function listDriveChildren(args: {
  drive_id: string;
  item_id: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: DriveItem[]; has_more: boolean; total_returned: number } | McpError> {
  const { drive_id, item_id, limit = 50, offset = 0 } = args;

  try {
    const client = getGraphClient();
    // Note: Graph /children does not support $skip. We fetch $top items and
    // manually skip `offset` entries when the caller requests pagination.
    const fetchCount = limit + offset;
    const response = await client
      .api(`/drives/${drive_id}/items/${item_id}/children?$top=${fetchCount}`)
      .get() as { value: GraphItem[]; "@odata.nextLink"?: string };

    const allItems = (response.value ?? []).map((item) => ({
      name: item.name,
      id: item.id,
      type: (item.folder ? "folder" : "file") as "file" | "folder",
      modified: item.lastModifiedDateTime ?? null,
      size: item.size ?? null,
    }));

    const items = allItems.slice(offset, offset + limit);
    const has_more = items.length === limit || !!response["@odata.nextLink"];

    return { items, has_more, total_returned: items.length };
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode === 404) {
      return { error: "item_not_found", message: `No item with id '${item_id}' found in drive '${drive_id}'` };
    }
    if (e.statusCode === 400) {
      return { error: "drive_not_found", message: `Drive ID '${drive_id}' not accessible` };
    }
    return { error: "graph_error", message: e.message ?? String(err) };
  }
}
