import { getGraphClient } from "../graph/client.js";
import type { GraphItem, McpError } from "../types.js";
import { resolveDrive, listAllDrives } from "./resolve-drive.js";

interface BrowseItem {
  name: string;
  item_id: string;
  type: "file" | "folder";
  modified: string | null;
  size: number | null;
  mime_type?: string | null;
  download_url?: string | null;
}

interface BrowseResult {
  drive_name: string;
  path: string;
  items?: BrowseItem[];
  file?: BrowseItem & { download_url: string | null; mime_type: string | null };
  has_more?: boolean;
  total_returned?: number;
}

export async function browse(args: {
  drive_name?: string;
  path?: string;
  item_id?: string;
  limit?: number;
  offset?: number;
}): Promise<BrowseResult | { drives: { name: string; description: string }[] } | McpError> {
  const { drive_name, path, item_id, limit = 50, offset = 0 } = args;

  // No drive_name → list all drives
  if (!drive_name) {
    const drives = await listAllDrives();
    if ("error" in drives) return drives;
    return { drives };
  }

  // Resolve drive name to ID
  const resolved = await resolveDrive(drive_name);
  if ("error" in resolved) return resolved;
  const { driveId, driveName } = resolved;

  const client = getGraphClient();

  try {
    // Determine what to fetch
    let targetItemId: string;
    let displayPath: string;

    if (item_id) {
      // Use provided item_id directly
      targetItemId = item_id;
      displayPath = path ?? "(by item_id)";
    } else if (path) {
      // Resolve path to item
      const cleanPath = path.replace(/^\/+/, "");
      const item = await client
        .api(`/drives/${driveId}/root:/${encodeURI(cleanPath)}`)
        .get() as GraphItem;

      // If it's a file, return its metadata directly
      if (item.file) {
        return {
          drive_name: driveName,
          path: cleanPath,
          file: {
            name: item.name,
            item_id: item.id,
            type: "file",
            modified: item.lastModifiedDateTime ?? null,
            size: item.size ?? null,
            mime_type: item.file.mimeType ?? null,
            download_url: item["@microsoft.graph.downloadUrl"] ?? null,
          },
        };
      }

      targetItemId = item.id;
      displayPath = cleanPath;
    } else {
      // No path → list drive root
      targetItemId = "root";
      displayPath = "/";
    }

    // List children of the folder
    const fetchCount = limit + offset;
    const response = await client
      .api(`/drives/${driveId}/items/${targetItemId}/children?$top=${fetchCount}`)
      .get() as { value: GraphItem[]; "@odata.nextLink"?: string };

    const allItems = (response.value ?? []).map((item): BrowseItem => ({
      name: item.name,
      item_id: item.id,
      type: item.folder ? "folder" : "file",
      modified: item.lastModifiedDateTime ?? null,
      size: item.size ?? null,
    }));

    const items = allItems.slice(offset, offset + limit);
    const has_more = items.length === limit || !!response["@odata.nextLink"];

    return {
      drive_name: driveName,
      path: displayPath,
      items,
      has_more,
      total_returned: items.length,
    };
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode === 404) {
      return { error: "not_found", message: `Path '${path ?? item_id}' not found in drive '${driveName}'` };
    }
    return { error: "graph_error", message: e.message ?? String(err) };
  }
}
