import { getGraphClient } from "../graph/client.js";
import type { GraphItem, McpError } from "../types.js";
import { resolveDrive } from "./resolve-drive.js";
import { fuzzyScore, tokenize, parseJobFolder } from "./fuzzy.js";

interface JobResult {
  job_number: string | null;
  job_name: string;
  folder_path: string;
  size: number | null;
  modified: string | null;
}

interface SearchJobsResult {
  query: string | null;
  matched_jobs: JobResult[];
  total_returned: number;
}

export async function searchJobs(args: {
  keyword?: string;
  limit?: number;
}): Promise<SearchJobsResult | McpError> {
  const { keyword, limit = 50 } = args;

  const resolved = await resolveDrive("Jobs");
  if ("error" in resolved) return resolved;
  const { driveId } = resolved;

  const client = getGraphClient();

  try {
    const response = await client
      .api(`/drives/${driveId}/items/root/children?$top=200`)
      .get() as { value: GraphItem[] };

    const folders = (response.value ?? []).filter((item) => !!item.folder);
    const tokens = tokenize(keyword);

    let candidates = folders.map((item) => ({
      folder_name: item.name,
      size: item.size ?? null,
      modified: item.lastModifiedDateTime ?? null,
      score: tokens.length > 0 ? fuzzyScore(item.name, tokens) : 1,
    }));

    if (tokens.length > 0) {
      candidates = candidates.filter((c) => c.score > 0);
      candidates.sort((a, b) => b.score - a.score);
    }

    const matched_jobs: JobResult[] = candidates.slice(0, limit).map((c) => {
      const { job_number, job_name } = parseJobFolder(c.folder_name);
      return {
        job_number,
        job_name,
        folder_path: c.folder_name,
        size: c.size,
        modified: c.modified,
      };
    });

    return { query: keyword ?? null, matched_jobs, total_returned: matched_jobs.length };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { error: "graph_error", message: e.message ?? String(err) };
  }
}
