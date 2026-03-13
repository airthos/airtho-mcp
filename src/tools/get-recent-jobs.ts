/**
 * get_recent_jobs: Return jobs sorted by most recently modified.
 * Single Graph call — no GUIDs in output.
 */

import { getGraphClient } from "../graph/client.js";
import type { GraphItem, McpError } from "../types.js";
import { resolveDrive } from "./resolve-drive.js";
import { parseJobFolder } from "./fuzzy.js";

interface RecentJob {
  job_number: string | null;
  job_name: string;
  folder_path: string;
  modified: string | null;
}

interface GetRecentJobsResult {
  jobs: RecentJob[];
  total_returned: number;
}

export async function getRecentJobs(args: {
  limit?: number;
}): Promise<GetRecentJobsResult | McpError> {
  const { limit = 10 } = args;

  const resolved = await resolveDrive("Jobs");
  if ("error" in resolved) return resolved;
  const { driveId } = resolved;

  const client = getGraphClient();

  try {
    const response = await client
      .api(`/drives/${driveId}/items/root/children?$orderby=lastModifiedDateTime desc&$top=${limit}`)
      .get() as { value: GraphItem[] };

    const folders = (response.value ?? []).filter((item) => !!item.folder);

    const jobs: RecentJob[] = folders.map((item) => {
      const { job_number, job_name } = parseJobFolder(item.name);
      return {
        job_number,
        job_name,
        folder_path: item.name,
        modified: item.lastModifiedDateTime ?? null,
      };
    });

    return { jobs, total_returned: jobs.length };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { error: "graph_error", message: e.message ?? String(err) };
  }
}
