/**
 * get_job: Resolve a job by keyword and return its metadata + top-level structure
 * in a single call. Eliminates the search_jobs → browse two-step entirely.
 * No item_ids in output.
 */

import { getGraphClient } from "../graph/client.js";
import type { GraphItem, McpError } from "../types.js";
import { resolveJob } from "./resolve-job.js";

interface JobContentsItem {
  name: string;
  type: "file" | "folder";
  size: number | null;
  modified: string | null;
}

interface GetJobResult {
  job_number: string | null;
  job_name: string;
  folder_path: string;
  size: number | null;
  modified: string | null;
  contents: JobContentsItem[];
}

export async function getJob(args: {
  keyword: string;
}): Promise<GetJobResult | McpError> {
  const { keyword } = args;

  const job = await resolveJob(keyword);
  if ("error" in job) return job;

  const client = getGraphClient();

  try {
    const response = await client
      .api(`/drives/${job._driveId}/items/${job._itemId}/children?$top=200`)
      .get() as { value: GraphItem[] };

    const contents: JobContentsItem[] = (response.value ?? []).map((item) => ({
      name: item.name,
      type: item.folder ? "folder" : "file",
      size: item.size ?? null,
      modified: item.lastModifiedDateTime ?? null,
    }));

    // Folders first, then files, each group sorted alphabetically
    contents.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return {
      job_number: job.job_number,
      job_name: job.job_name,
      folder_path: job.folder_name,
      size: null,
      modified: null,
      contents,
    };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { error: "graph_error", message: e.message ?? String(err) };
  }
}
