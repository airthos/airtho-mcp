import { getGraphClient } from "../graph/client.js";
import type { DriveInfo, GraphDrive, McpError } from "../types.js";

export async function listDrives(args: {
  site_id?: string;
}): Promise<DriveInfo[] | McpError> {
  const siteId = args.site_id ?? process.env.DEFAULT_SITE_ID;
  if (!siteId) {
    return {
      error: "missing_site_id",
      message: "No site_id provided and DEFAULT_SITE_ID is not configured",
    };
  }

  try {
    const client = getGraphClient();
    const response = await client.api(`/sites/${siteId}/drives`).get() as { value: GraphDrive[] };

    return (response.value ?? []).map((drive) => ({
      drive_id: drive.id,
      name: drive.name,
      drive_type: drive.driveType,
    }));
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode === 404) {
      return { error: "site_not_found", message: `Site '${siteId}' not found or not accessible` };
    }
    return { error: "graph_error", message: e.message ?? String(err) };
  }
}
