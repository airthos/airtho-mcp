import { getBearerToken } from "../graph/client.js";
import { GRAPH_BASE_URL } from "../constants.js";
import type { GraphItem, McpError } from "../types.js";
import { resolveDrive } from "./resolve-drive.js";
import { resolveSiteUrl } from "./resolve-site-url.js";
import { encodeSharePointPath, joinSharePointPath } from "./sharepoint-file-path.js";

interface UploadResult {
  drive_name: string;
  path: string;
  item_id: string;
  name: string;
  size: number | null;
  mime_type: string | null;
  web_url: string | null;
}

interface UploadedGraphItem extends GraphItem {
  webUrl?: string;
}

const SIMPLE_UPLOAD_LIMIT_BYTES = 250 * 1024 * 1024;

export async function uploadSharePointFile(args: {
  drive_name: string;
  site_url?: string;
  directory_path: string;
  filename: string;
  content_base64: string;
  content_type?: string;
  userToken?: string;
}): Promise<UploadResult | McpError> {
  const { drive_name, site_url, directory_path, filename, content_base64, content_type, userToken } = args;

  const site = site_url ? await resolveSiteUrl(site_url, userToken) : null;
  if (site && "error" in site) return site;

  const resolved = await resolveDrive(drive_name, userToken, site?.siteId);
  if ("error" in resolved) return resolved;

  const { driveId, driveName } = resolved;

  let destinationPath: string;
  let bytes: Buffer;

  try {
    destinationPath = joinSharePointPath(directory_path, filename);
    bytes = Buffer.from(content_base64, "base64");
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { error: "invalid_input", message: e.message ?? String(err) };
  }

  if (bytes.length === 0 && content_base64.length > 0) {
    return { error: "invalid_content", message: "content_base64 is not valid base64 file content" };
  }

  if (bytes.length > SIMPLE_UPLOAD_LIMIT_BYTES) {
    return {
      error: "file_too_large",
      message: "Simple Graph uploads support files up to 250 MB. Use an upload session for larger files.",
    };
  }

  try {
    const uploadUrl = `${GRAPH_BASE_URL}/drives/${driveId}/root:/${encodeSharePointPath(destinationPath)}:/content`;
    const token = await getBearerToken(userToken);
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": content_type ?? "application/octet-stream",
      },
      body: bytes,
    });

    if (!response.ok) {
      return {
        error: "graph_error",
        message: `Graph upload failed with ${response.status}: ${await response.text()}`,
      };
    }

    const item = await response.json() as UploadedGraphItem;

    return {
      drive_name: driveName,
      path: destinationPath,
      item_id: item.id,
      name: item.name,
      size: item.size ?? bytes.length,
      mime_type: item.file?.mimeType ?? content_type ?? null,
      web_url: item.webUrl ?? null,
    };
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode === 404) {
      return { error: "not_found", message: `Destination folder '${directory_path}' not found in drive '${driveName}'` };
    }
    return { error: "graph_error", message: e.message ?? String(err) };
  }
}
