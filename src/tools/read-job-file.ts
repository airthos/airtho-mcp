/**
 * read_job_file: Find and read a file from a job in one call.
 * Resolves job + file entirely server-side — the model never sees a GUID.
 * Collapses: search_jobs → find_in_job → airtho_read into a single call.
 */

import { getGraphClient } from "../graph/client.js";
import type { GraphItem, McpError } from "../types.js";
import { resolveJob } from "./resolve-job.js";
import { read } from "./read.js";

export async function readJobFile(args: {
  job_keyword: string;
  file_keyword: string;
}): Promise<unknown | McpError> {
  const { job_keyword, file_keyword } = args;

  const job = await resolveJob(job_keyword);
  if ("error" in job) return job;

  const client = getGraphClient();

  try {
    // Search within the job folder for the file — fetch a few candidates
    const response = await client
      .api(`/drives/${job._driveId}/items/${job._itemId}/search(q='${encodeURIComponent(file_keyword)}')?$top=5`)
      .get() as { value: GraphItem[] };

    const files = (response.value ?? []).filter((item) => !item.folder);

    if (files.length === 0) {
      return {
        error: "file_not_found",
        message: `No file matching '${file_keyword}' found in job '${job.folder_name}'`,
      };
    }

    // Use the top search result (Graph ranks by relevance)
    const best = files[0];

    // Read using item_id internally — never exposed in the response
    const content = await read({ drive_name: "Jobs", item_id: best.id });

    return content;
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { error: "graph_error", message: e.message ?? String(err) };
  }
}
