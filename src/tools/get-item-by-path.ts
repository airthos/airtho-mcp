import { getGraphClient } from "../graph/client.js";
import type { GraphItem, ItemMetadata, McpError } from "../types.js";

export async function getItemByPath(args: {
  drive_id: string;
  path: string;
}): Promise<ItemMetadata | McpError> {
  const { drive_id, path } = args;
  // Strip leading slash — Graph API path syntax is root:/{path}
  const cleanPath = path.replace(/^\/+/, "");

  try {
    const client = getGraphClient();
    const item = await client
      .api(`/drives/${drive_id}/root:/${encodeURI(cleanPath)}`)
      .get() as GraphItem;

    return {
      name: item.name,
      id: item.id,
      type: item.folder ? "folder" : "file",
      modified: item.lastModifiedDateTime ?? null,
      size: item.size ?? null,
      parent_id: item.parentReference?.id ?? null,
    };
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode === 404) {
      return { error: "item_not_found", message: `No item at path '${path}'` };
    }
    if (e.statusCode === 400) {
      return { error: "drive_not_found", message: `Drive ID '${drive_id}' not accessible` };
    }
    return { error: "graph_error", message: e.message ?? String(err) };
  }
}
