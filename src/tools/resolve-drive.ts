import { getGraphClient } from "../graph/client.js";
import type { GraphDrive, McpError } from "../types.js";

/** Cached drive list per cold-start (drives don't change often). */
let _driveCache: { id: string; name: string; nameLower: string }[] | null = null;

async function loadDrives(siteId: string): Promise<{ id: string; name: string; nameLower: string }[]> {
  if (_driveCache) return _driveCache;

  const client = getGraphClient();
  const response = await client.api(`/sites/${siteId}/drives`).get() as { value: GraphDrive[] };
  _driveCache = (response.value ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    nameLower: d.name.toLowerCase(),
  }));
  return _driveCache;
}

export interface ResolvedDrive {
  driveId: string;
  driveName: string;
}

/**
 * Resolve a human-readable drive name to a Graph drive ID.
 * Case-insensitive match. Returns an McpError if not found.
 */
export async function resolveDrive(driveName: string): Promise<ResolvedDrive | McpError> {
  const siteId = process.env.DEFAULT_SITE_ID;
  if (!siteId) {
    return { error: "missing_site_id", message: "DEFAULT_SITE_ID is not configured on the server" };
  }

  try {
    const drives = await loadDrives(siteId);
    const target = driveName.toLowerCase();
    const match = drives.find((d) => d.nameLower === target);
    if (!match) {
      const available = drives.map((d) => d.name).join(", ");
      return {
        error: "drive_not_found",
        message: `No drive named '${driveName}'. Available drives: ${available}`,
      };
    }
    return { driveId: match.id, driveName: match.name };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { error: "graph_error", message: e.message ?? String(err) };
  }
}

/** List all available drives (for when no drive_name is provided). */
export async function listAllDrives(): Promise<{ name: string; description: string }[] | McpError> {
  const siteId = process.env.DEFAULT_SITE_ID;
  if (!siteId) {
    return { error: "missing_site_id", message: "DEFAULT_SITE_ID is not configured on the server" };
  }

  try {
    const drives = await loadDrives(siteId);
    return drives.map((d) => ({ name: d.name, description: "document library" }));
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { error: "graph_error", message: e.message ?? String(err) };
  }
}
