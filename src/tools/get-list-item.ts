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

interface GetListItemResult {
  list_name: string;
  item: Record<string, unknown>;
}

export async function getListItem(args: {
  list_name: string;
  item_id: number;
  columns?: string[];
  site_name?: string;
}): Promise<GetListItemResult | McpError> {
  const { list_name, item_id, columns, site_name } = args;

  // Validate item_id is a positive integer
  if (!Number.isInteger(item_id) || item_id < 1) {
    return { error: "invalid_param", message: "item_id must be a positive integer." };
  }

  // Validate column names — only allow alphanumeric, underscore, and space
  const SAFE_FIELD = /^[\w ]+$/;
  if (columns?.some((c) => !SAFE_FIELD.test(c))) {
    return { error: "invalid_param", message: "Column names contain invalid characters." };
  }

  const resolvedSite = resolveSite(site_name);
  if ("error" in resolvedSite) return resolvedSite;
  const { siteId } = resolvedSite;

  const resolvedList = await resolveList(siteId, list_name);
  if ("error" in resolvedList) return resolvedList;
  const { _listId, listDisplayName } = resolvedList;

  const client = getGraphClient();

  try {
    const expandParam =
      columns && columns.length > 0
        ? `fields($select=${columns.join(",")})`
        : "fields";

    const raw = (await client
      .api(`/sites/${siteId}/lists/${_listId}/items/${item_id}?$expand=${expandParam}`)
      .get()) as GraphListItem;

    const fields = raw.fields ?? {};
    let pairs: [string, unknown][];
    if (columns && columns.length > 0) {
      pairs = columns.map((col) => [col, fields[col] ?? null]);
    } else {
      pairs = Object.entries(fields).filter(([k]) => !SYSTEM_FIELDS.has(k));
    }

    const item = { sp_id: parseInt(raw.id, 10), ...Object.fromEntries(pairs) };

    return { list_name: listDisplayName, item };
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode === 404) {
      return {
        error: "not_found",
        message: `Item ${item_id} not found in list '${list_name}'.`,
      };
    }
    if (e.statusCode === 403) {
      return {
        error: "forbidden",
        message: "Access denied. Ensure the app has Sites.Read.All permission.",
      };
    }
    return { error: "graph_error", message: e.message ?? String(err) };
  }
}
