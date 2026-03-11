import { getGraphClient } from "../graph/client.js";
import type { FileMetadata, GraphItem, McpError } from "../types.js";

export async function getFileMetadata(args: {
  drive_id: string;
  item_id: string;
}): Promise<FileMetadata | McpError> {
  const { drive_id, item_id } = args;

  try {
    const client = getGraphClient();
    const item = await client
      .api(`/drives/${drive_id}/items/${item_id}`)
      .get() as GraphItem & { createdDateTime?: string };

    return {
      name: item.name,
      id: item.id,
      size: item.size ?? null,
      modified: item.lastModifiedDateTime ?? null,
      created: item.createdDateTime ?? null,
      download_url: item["@microsoft.graph.downloadUrl"] ?? null,
      mime_type: item.file?.mimeType ?? null,
    };
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode === 404) {
      return { error: "item_not_found", message: `No item with id '${item_id}' found in drive '${drive_id}'` };
    }
    return { error: "graph_error", message: e.message ?? String(err) };
  }
}
