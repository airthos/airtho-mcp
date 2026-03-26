import { getGraphClient } from "../graph/client.js";
import type { GraphItem, McpError } from "../types.js";
import { resolveDrive } from "./resolve-drive.js";

interface SearchHit {
  name: string;
  item_id: string;
  type: "file" | "folder";
  path: string | null;
  modified: string | null;
  size: number | null;
}

interface SearchResponse {
  drive_name: string;
  query: string;
  scoped_to: string;
  results: SearchHit[];
  has_more: boolean;
  total_returned: number;
}

export async function search(args: {
  query: string;
  drive_name?: string;
  folder_path?: string;
  limit?: number;
}): Promise<SearchResponse | McpError> {
  const { query, drive_name = "Jobs", folder_path, limit = 50 } = args;

  // Resolve drive
  const resolved = await resolveDrive(drive_name);
  if ("error" in resolved) return resolved;
  const { driveId, driveName } = resolved;

  const client = getGraphClient();

  try {
    // Determine scope — either a specific folder or the drive root
    let scopeItemId = "root";
    let scopeDisplay = "/";

    if (folder_path) {
      const cleanPath = folder_path.replace(/^\/+/, "");
      const folder = await client
        .api(`/drives/${driveId}/root:/${encodeURI(cleanPath)}`)
        .get() as GraphItem;
      scopeItemId = folder.id;
      scopeDisplay = cleanPath;
    }

    let response = await client
      .api(`/drives/${driveId}/items/${scopeItemId}/search(q='${encodeURIComponent(query)}')?$top=${limit + 1}`)
      .get() as { value: GraphItem[] };

    let raw = response.value ?? [];

    // Fallback: Graph search scoped to a subfolder is unreliable.
    // If zero results and we were scoped, retry at drive root and filter client-side.
    if (raw.length === 0 && scopeItemId !== "root") {
      response = await client
        .api(`/drives/${driveId}/items/root/search(q='${encodeURIComponent(query)}')?$top=200`)
        .get() as { value: GraphItem[] };

      const scopePath = `root:/${scopeDisplay}`;
      raw = (response.value ?? []).filter(
        (item) =>
          item.parentReference?.path?.includes(scopePath) ||
          item.parentReference?.id === scopeItemId
      );
    }

    const has_more = raw.length > limit;
    const results = raw.slice(0, limit).map((item): SearchHit => ({
      name: item.name,
      item_id: item.id,
      type: item.folder ? "folder" : "file",
      path: item.parentReference?.path?.replace(/.*root:/, "")
        || item.parentReference?.name
        || null,
      modified: item.lastModifiedDateTime ?? null,
      size: item.size ?? null,
    }));

    return {
      drive_name: driveName,
      query,
      scoped_to: scopeDisplay,
      results,
      has_more,
      total_returned: results.length,
    };
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode === 404) {
      const target = folder_path ?? "root";
      return { error: "not_found", message: `Folder '${target}' not found in drive '${driveName}'` };
    }
    return { error: "graph_error", message: e.message ?? String(err) };
  }
}
