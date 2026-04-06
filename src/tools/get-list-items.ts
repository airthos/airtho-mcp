import { getGraphClient } from "../graph/client.js";
import { resolveSite } from "./resolve-site.js";
import { resolveList } from "./resolve-list.js";
import type { GraphListItem, McpError } from "../types.js";

/**
 * Fields always present in Graph list item responses that are not useful to expose.
 * User-defined columns and Modified/Created are kept.
 */
const SYSTEM_FIELDS = new Set([
  "@odata.etag",
  "id",
  "ContentType",
  "AuthorLookupId",
  "EditorLookupId",
  "Attachments",
  "Edit",
  "LinkTitleNoMenu",
  "LinkTitle",
  "_UIVersionString",
  "ItemChildCount",
  "FolderChildCount",
  "FileSystemObjectType",
  "ServerRedirectedEmbedUri",
  "ServerRedirectedEmbedUrl",
  "ComplianceAssetId",
  "CheckoutUserId",
  "FileDirRef",
  "FileLeafRef",
  "AppAuthorLookupId",
  "AppEditorLookupId",
]);

function extractItem(
  raw: GraphListItem,
  columns?: string[]
): Record<string, unknown> {
  const sp_id = parseInt(raw.id, 10);
  const fields = raw.fields ?? {};

  let pairs: [string, unknown][];
  if (columns && columns.length > 0) {
    pairs = columns.map((col) => [col, fields[col] ?? null]);
  } else {
    pairs = Object.entries(fields).filter(([k]) => !SYSTEM_FIELDS.has(k));
  }

  return { sp_id, ...Object.fromEntries(pairs) };
}

interface GetListItemsResult {
  list_name: string;
  site_name: string;
  items: Record<string, unknown>[];
  total_returned: number;
  has_more: boolean;
}

export async function getListItems(args: {
  list_name: string;
  columns?: string[];
  filter_field?: string;
  filter_value?: string;
  limit?: number;
  site_name?: string;
  userToken?: string;
}): Promise<GetListItemsResult | McpError> {
  const { list_name, columns, filter_field, filter_value, limit = 50, site_name, userToken } = args;

  // Validate column names — only allow alphanumeric, underscore, and space
  const SAFE_FIELD = /^[\w ]+$/;
  if (columns?.some((c) => !SAFE_FIELD.test(c))) {
    return { error: "invalid_param", message: "Column names contain invalid characters." };
  }
  if (filter_field && !SAFE_FIELD.test(filter_field)) {
    return { error: "invalid_param", message: "filter_field contains invalid characters." };
  }

  const resolvedSite = resolveSite(site_name);
  if ("error" in resolvedSite) return resolvedSite;
  const { siteId, siteName } = resolvedSite;

  const resolvedList = await resolveList(siteId, list_name, userToken);
  if ("error" in resolvedList) return resolvedList;
  const { _listId, listDisplayName } = resolvedList;

  const client = getGraphClient(userToken);

  try {
    const cap = Math.min(Math.max(limit, 1), 200);

    const expandParam =
      columns && columns.length > 0
        ? `fields($select=${columns.join(",")})`
        : "fields";

    // Escape single quotes in filter_value to prevent OData injection
    const filterParam =
      filter_field && filter_value !== undefined
        ? `&$filter=fields/${filter_field} eq '${String(filter_value).replace(/'/g, "''")}'`
        : "";

    const url = `/sites/${siteId}/lists/${_listId}/items?$expand=${expandParam}&$top=${cap}${filterParam}`;

    const response = (await client
      .api(url)
      .header("Prefer", "HonorNonIndexedQueriesWarningMayFailRandomly")
      .get()) as { value: GraphListItem[]; "@odata.nextLink"?: string };

    const items = (response.value ?? []).map((raw) =>
      extractItem(raw, columns)
    );

    return {
      list_name: listDisplayName,
      site_name: siteName,
      items,
      total_returned: items.length,
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
