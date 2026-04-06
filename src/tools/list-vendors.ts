/**
 * list_vendors: Fuzzy-search Airtho's Vendors drive by keyword.
 * Same pattern as search_jobs — server-side filtering, no GUIDs in output.
 */

import { getGraphClient } from "../graph/client.js";
import type { GraphItem, McpError } from "../types.js";
import { resolveDrive } from "./resolve-drive.js";
import { fuzzyScore, tokenize } from "./fuzzy.js";

interface VendorResult {
  vendor_name: string;
  folder_path: string;
  modified: string | null;
}

interface ListVendorsResult {
  query: string | null;
  vendors: VendorResult[];
  total_returned: number;
}

export async function listVendors(args: {
  keyword?: string;
  limit?: number;
  userToken?: string;
}): Promise<ListVendorsResult | McpError> {
  const { keyword, limit = 50, userToken } = args;

  const resolved = await resolveDrive("Vendors", userToken);
  if ("error" in resolved) return resolved;
  const { driveId } = resolved;

  const client = getGraphClient(userToken);

  try {
    const response = await client
      .api(`/drives/${driveId}/items/root/children?$top=200`)
      .get() as { value: GraphItem[] };

    const topFolders = (response.value ?? []).filter((item) => !!item.folder);
    const tokens = tokenize(keyword);

    // Detect alpha-index structure (folders like "A's", "B's", etc.)
    const isAlphaIndex = topFolders.length > 0 &&
      topFolders.every((f) => /^[A-Z]'?s?$/i.test(f.name.replace(/['']/g, "'")));

    if (isAlphaIndex && tokens.length > 0) {
      // Search inside alpha-index folders for actual vendor names
      const subResults = await Promise.all(
        topFolders.map(async (alphaFolder) => {
          try {
            const subResp = await client
              .api(`/drives/${driveId}/items/${alphaFolder.id}/children?$top=200`)
              .get() as { value: GraphItem[] };
            return (subResp.value ?? [])
              .filter((item) => !!item.folder)
              .map((item) => ({
                name: item.name,
                parentFolder: alphaFolder.name,
                modified: item.lastModifiedDateTime ?? null,
                score: fuzzyScore(item.name, tokens),
              }));
          } catch {
            return [];
          }
        }),
      );

      let candidates = subResults.flat().filter((c) => c.score > 0);
      candidates.sort((a, b) => b.score - a.score);

      const vendors: VendorResult[] = candidates.slice(0, limit).map((c) => ({
        vendor_name: c.name,
        folder_path: `${c.parentFolder}/${c.name}`,
        modified: c.modified,
      }));

      return { query: keyword ?? null, vendors, total_returned: vendors.length };
    }

    // Standard flat structure or no keyword — match top-level folders
    let candidates = topFolders.map((item) => ({
      name: item.name,
      modified: item.lastModifiedDateTime ?? null,
      score: tokens.length > 0 ? fuzzyScore(item.name, tokens) : 1,
    }));

    if (tokens.length > 0) {
      candidates = candidates.filter((c) => c.score > 0);
      candidates.sort((a, b) => b.score - a.score);
    }

    const vendors: VendorResult[] = candidates.slice(0, limit).map((c) => ({
      vendor_name: c.name,
      folder_path: c.name,
      modified: c.modified,
    }));

    return { query: keyword ?? null, vendors, total_returned: vendors.length };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { error: "graph_error", message: e.message ?? String(err) };
  }
}
