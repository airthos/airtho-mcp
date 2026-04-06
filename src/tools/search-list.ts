/**
 * Keyword search across SharePoint list items.
 *
 * Note: Graph API does not support $search on list items. This tool fetches
 * up to 200 items and filters client-side. Results are limited to items within
 * the first page — see has_more if the list may have additional unscanned items.
 */
import { getGraphClient } from "../graph/client.js";
import { resolveSite } from "./resolve-site.js";
import { resolveList } from "./resolve-list.js";
import type { GraphListItem, McpError } from "../types.js";

const SYSTEM_FIELDS = new Set([
  "@odata.etag", "id", "ContentType", "AuthorLookupId", "EditorLookupId",
  "Attachments", "Edit", "LinkTitleNoMenu", "LinkTitle", "_UIVersionString",
  "ItemChildCount", "FolderChildCount", "FileSystemObjectType",
  "ServerRedirectedEmbedUri", "ServerRedirectedEmbedUrl", "ComplianceAssetId",
  "CheckoutUserId", "FileDirRef", "FileLeafRef", "AppAuthorLookupId", "AppEditorLookupId",
]);

interface SearchMatch {
  sp_id: number;
  title: string | null;
  matched_fields: Record<string, string>;
}

interface SearchListResult {
  list_name: string;
  keyword: string;
  matches: SearchMatch[];
  total_matches: number;
  searched_items: number;
  has_more: boolean;
}

export async function searchList(args: {
  list_name: string;
  keyword: string;
  limit?: number;
  site_name?: string;
  userToken?: string;
}): Promise<SearchListResult | McpError> {
  const { list_name, keyword, limit = 20, site_name, userToken } = args;

  const resolvedSite = resolveSite(site_name);
  if ("error" in resolvedSite) return resolvedSite;
  const { siteId, siteName: _siteName } = resolvedSite;

  const resolvedList = await resolveList(siteId, list_name, userToken);
  if ("error" in resolvedList) return resolvedList;
  const { _listId, listDisplayName } = resolvedList;

  const client = getGraphClient(userToken);

  try {
    // Fetch one full page — $search unsupported, client-side match required
    const response = (await client
      .api(`/sites/${siteId}/lists/${_listId}/items?$expand=fields&$top=200`)
      .header("Prefer", "HonorNonIndexedQueriesWarningMayFailRandomly")
      .get()) as { value: GraphListItem[]; "@odata.nextLink"?: string };

    const kwLower = keyword.toLowerCase();
    const matches: SearchMatch[] = [];

    for (const raw of response.value ?? []) {
      if (matches.length >= limit) break;

      const fields = raw.fields ?? {};
      const matched_fields: Record<string, string> = {};

      for (const [key, val] of Object.entries(fields)) {
        if (SYSTEM_FIELDS.has(key)) continue;
        const str = String(val ?? "");
        if (str.toLowerCase().includes(kwLower)) {
          matched_fields[key] = str;
        }
      }

      if (Object.keys(matched_fields).length > 0) {
        matches.push({
          sp_id: parseInt(raw.id, 10),
          title: (fields["Title"] as string | null) ?? null,
          matched_fields,
        });
      }
    }

    return {
      list_name: listDisplayName,
      keyword,
      matches,
      total_matches: matches.length,
      searched_items: (response.value ?? []).length,
      has_more: !!response["@odata.nextLink"],
    };
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode === 403) {
      return {
        error: "forbidden",
        message: "Access denied. Ensure the app has Sites.Read.All permission.",
      };
    }
    return { error: "graph_error", message: e.message ?? String(err) };
  }
}
