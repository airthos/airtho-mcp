import { getBearerToken, getGraphClient } from "../graph/client.js";
import { GRAPH_BASE_URL } from "../constants.js";
import type { GraphItem, McpError } from "../types.js";
import { resolveDrive } from "./resolve-drive.js";
import { resolveSiteUrl } from "./resolve-site-url.js";
import { cleanSharePointPath, encodeSharePointPath } from "./sharepoint-file-path.js";

interface DownloadResult {
  drive_name: string;
  path: string | null;
  item_id: string;
  name: string;
  size: number | null;
  mime_type: string | null;
  content_base64: string;
}

export async function downloadSharePointFile(args: {
  drive_name: string;
  site_url?: string;
  path?: string;
  item_id?: string;
  userToken?: string;
}): Promise<DownloadResult | McpError> {
  const { drive_name, site_url, path, item_id, userToken } = args;

  if (!path && !item_id) {
    return { error: "missing_target", message: "Provide either path or item_id" };
  }

  const site = site_url ? await resolveSiteUrl(site_url, userToken) : null;
  if (site && "error" in site) return site;

  const resolved = await resolveDrive(drive_name, userToken, site?.siteId);
  if ("error" in resolved) return resolved;

  const { driveId, driveName } = resolved;
  const client = getGraphClient(userToken);

  try {
    const cleanPath = path ? cleanSharePointPath(path) : null;
    const item = item_id
      ? await client.api(`/drives/${driveId}/items/${item_id}`).get() as GraphItem
      : await client.api(`/drives/${driveId}/root:/${encodeSharePointPath(cleanPath!)}`).get() as GraphItem;

    if (item.folder) {
      return { error: "not_a_file", message: `'${path ?? item_id}' is a folder, not a file` };
    }

    const contentUrl = `${GRAPH_BASE_URL}/drives/${driveId}/items/${item.id}/content`;
    const token = await getBearerToken(userToken);
    const response = await fetch(contentUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      return {
        error: "graph_error",
        message: `Graph download failed with ${response.status}: ${await response.text()}`,
      };
    }

    const bytes = Buffer.from(await response.arrayBuffer());

    return {
      drive_name: driveName,
      path: cleanPath,
      item_id: item.id,
      name: item.name,
      size: item.size ?? bytes.length,
      mime_type: item.file?.mimeType ?? response.headers.get("content-type"),
      content_base64: bytes.toString("base64"),
    };
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode === 404) {
      return { error: "not_found", message: `File '${path ?? item_id}' not found in drive '${driveName}'` };
    }
    return { error: "graph_error", message: e.message ?? String(err) };
  }
}
