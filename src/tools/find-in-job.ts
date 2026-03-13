/**
 * find_in_job: Search for files within a specific job folder using keywords.
 * Resolves the job server-side — no item_ids in input or output.
 * Collapses: search_jobs → airtho_search(scoped) into a single call.
 */

import { getGraphClient } from "../graph/client.js";
import type { GraphItem, McpError } from "../types.js";
import { resolveJob } from "./resolve-job.js";

interface FileHit {
  name: string;
  path: string;
  size: number | null;
  modified: string | null;
}

interface FindInJobResult {
  job: string;
  query: string;
  results: FileHit[];
  total_returned: number;
  has_more: boolean;
}

export async function findInJob(args: {
  job_keyword: string;
  file_keyword: string;
  limit?: number;
}): Promise<FindInJobResult | McpError> {
  const { job_keyword, file_keyword, limit = 20 } = args;

  const job = await resolveJob(job_keyword);
  if ("error" in job) return job;

  const client = getGraphClient();

  try {
    const response = await client
      .api(`/drives/${job._driveId}/items/${job._itemId}/search(q='${encodeURIComponent(file_keyword)}')?$top=${limit + 1}`)
      .get() as { value: GraphItem[] };

    const all = (response.value ?? []).filter((item) => !item.folder);
    const has_more = all.length > limit;
    const items = all.slice(0, limit);

    const results: FileHit[] = items.map((item) => ({
      name: item.name,
      // Strip the opaque drive root prefix, return a clean relative path
      path: item.parentReference?.path?.replace(/.*root:\//, "") ?? job.folder_name,
      size: item.size ?? null,
      modified: item.lastModifiedDateTime ?? null,
    }));

    return {
      job: job.folder_name,
      query: file_keyword,
      results,
      total_returned: results.length,
      has_more,
    };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { error: "graph_error", message: e.message ?? String(err) };
  }
}
