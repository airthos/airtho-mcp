/**
 * Shared job resolution logic.
 * Finds the best-matching job folder by keyword.
 * item_id is returned for internal Graph API use — it should NEVER appear in MCP responses.
 */

import { getGraphClient } from "../graph/client.js";
import type { GraphItem, McpError } from "../types.js";
import { resolveDrive } from "./resolve-drive.js";
import { fuzzyScore, tokenize, parseJobFolder } from "./fuzzy.js";

export interface ResolvedJob {
  /** Human-readable folder name, e.g. "051 Factorial" */
  folder_name: string;
  /** Parsed job number, e.g. "051". Null if name doesn't match pattern. */
  job_number: string | null;
  /** Parsed job name, e.g. "Factorial". Falls back to folder_name. */
  job_name: string;
  /** Graph drive ID — internal use only, never expose in responses */
  _driveId: string;
  /** Graph item ID — internal use only, never expose in responses */
  _itemId: string;
  /** Other matching job folder names, if any */
  alternatives?: string[];
}

/**
 * Resolve a keyword to the best-matching job folder.
 * Returns McpError if no match found or on Graph failure.
 */
export async function resolveJob(keyword: string, userToken?: string): Promise<ResolvedJob | McpError> {
  const resolved = await resolveDrive("Jobs", userToken);
  if ("error" in resolved) return resolved;
  const { driveId } = resolved;

  const client = getGraphClient(userToken);

  try {
    const response = await client
      .api(`/drives/${driveId}/items/root/children?$top=200`)
      .get() as { value: GraphItem[] };

    const folders = (response.value ?? []).filter((item) => !!item.folder);
    const tokens = tokenize(keyword);

    const scored = folders
      .map((item) => ({ item, score: fuzzyScore(item.name, tokens) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      const names = folders.map((f) => f.name).join(", ");
      return {
        error: "job_not_found",
        message: `No job matching '${keyword}'. Available jobs: ${names}`,
      };
    }

    const best = scored[0].item;
    const { job_number, job_name } = parseJobFolder(best.name);

    const result: ResolvedJob = {
      folder_name: best.name,
      job_number,
      job_name,
      _driveId: driveId,
      _itemId: best.id,
    };

    if (scored.length > 1) {
      result.alternatives = scored.slice(1, 4).map((s) => s.item.name);
    }

    return result;
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { error: "graph_error", message: e.message ?? String(err) };
  }
}
