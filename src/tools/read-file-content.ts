import { getBearerToken, getGraphClient } from "../graph/client.js";
import type { FileContent, GraphItem, McpError } from "../types.js";
import { CHARACTER_LIMIT, GRAPH_BASE_URL } from "../constants.js";

// MIME types we can return as plain text directly
const TEXT_MIME_TYPES = new Set([
  "text/plain",
  "text/csv",
  "text/html",
  "text/markdown",
  "text/xml",
  "text/javascript",
  "application/json",
  "application/xml",
  "application/javascript",
]);

// Graph API can convert these to plain text via ?format=text
const WORD_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function readFileContent(args: {
  drive_id: string;
  item_id: string;
}): Promise<FileContent | McpError> {
  const { drive_id, item_id } = args;

  try {
    const client = getGraphClient();
    const item = await client.api(`/drives/${drive_id}/items/${item_id}`).get() as GraphItem;

    const mimeType: string = item.file?.mimeType ?? "application/octet-stream";
    const downloadUrl: string | undefined = item["@microsoft.graph.downloadUrl"];

    if (!downloadUrl) {
      return { error: "content_unavailable", message: "No download URL available — item may be a folder" };
    }

    // Plain text files: fetch download URL directly
    if (TEXT_MIME_TYPES.has(mimeType)) {
      const response = await fetch(downloadUrl);
      const text = await response.text();
      const truncated = text.length > CHARACTER_LIMIT;
      return { content: truncated ? text.slice(0, CHARACTER_LIMIT) : text, mime_type: mimeType, truncated };
    }

    // Word documents: use Graph API text conversion
    if (mimeType === WORD_MIME_TYPE) {
      const token = await getBearerToken();
      const response = await fetch(
        `${GRAPH_BASE_URL}/drives/${drive_id}/items/${item_id}/content?format=text`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.ok) {
        const text = await response.text();
        const truncated = text.length > CHARACTER_LIMIT;
        return { content: truncated ? text.slice(0, CHARACTER_LIMIT) : text, mime_type: "text/plain", truncated };
      }
      // Fall through to unsupported if conversion fails
    }

    return { error: "content_unavailable", message: `File type '${mimeType}' is not supported for text extraction` };
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode === 404) {
      return { error: "item_not_found", message: `No item with id '${item_id}' found in drive '${drive_id}'` };
    }
    return { error: "graph_error", message: e.message ?? String(err) };
  }
}
