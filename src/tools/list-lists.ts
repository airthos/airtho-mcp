import { getGraphClient } from "../graph/client.js";
import { resolveSite } from "./resolve-site.js";
import type { GraphList, GraphListColumn, McpError } from "../types.js";

interface ListColumnInfo {
  name: string;        // human-readable display name
  field_name: string;  // internal/static name — use this in the columns param for get_list_items
  type: string;
  choices?: string[];
}

interface ListInfo {
  name: string;
  description?: string;
  columns: ListColumnInfo[];
}

interface ListListsResult {
  site_name: string;
  lists: ListInfo[];
  total: number;
}

/**
 * SP list templates that are document libraries or internal system lists.
 * These are already covered by the doc lib tools or are not useful to expose.
 */
const SKIP_TEMPLATES = new Set([
  "documentLibrary",
  "webPageLibrary",
  "pictureLibrary",
  "xmlForm",
  "masterPage",
  "webTemplateCatalog",
  "listTemplateCatalog",
  "userInformation",
  "webPartCatalog",
  "solutionCatalog",
  "themeCatalog",
  "designCatalog",
  "appDataCatalog",
]);

function inferColumnType(col: GraphListColumn): string {
  if (col.text !== undefined) return "text";
  if (col.number !== undefined) return "number";
  if (col.dateTime !== undefined) return "dateTime";
  if (col.choice !== undefined) return "choice";
  if (col.boolean !== undefined) return "boolean";
  if (col.lookup !== undefined) return "lookup";
  if (col.personOrGroup !== undefined) return "person";
  if (col.currency !== undefined) return "currency";
  if (col.calculated !== undefined) return "calculated";
  if (col.hyperlink !== undefined) return "hyperlink";
  return "text";
}

function mapColumn(col: GraphListColumn): ListColumnInfo | null {
  if (col.hidden) return null;

  const type = inferColumnType(col);
  const info: ListColumnInfo = {
    name: col.displayName ?? col.name,
    field_name: col.name,
    type,
  };

  if (col.choice?.choices && col.choice.choices.length > 0) {
    info.choices = col.choice.choices;
  }

  return info;
}

export async function listLists(args: {
  site_name?: string;
  userToken?: string;
}): Promise<ListListsResult | McpError> {
  const resolved = resolveSite(args.site_name);
  if ("error" in resolved) return resolved;
  const { siteId, siteName } = resolved;

  const client = getGraphClient(args.userToken);

  try {
    const response = (await client
      .api(
        `/sites/${siteId}/lists?$expand=columns&$select=id,name,displayName,description,list`
      )
      .get()) as { value: GraphList[] };

    const lists = (response.value ?? [])
      .filter(
        (l) =>
          !l.list?.hidden &&
          !SKIP_TEMPLATES.has(l.list?.template ?? "")
      )
      .map((l): ListInfo => {
        const columns = (l.columns ?? [])
          .map(mapColumn)
          .filter((c): c is ListColumnInfo => c !== null);

        return {
          name: l.displayName ?? l.name,
          ...(l.description ? { description: l.description } : {}),
          columns,
        };
      });

    return { site_name: siteName, lists, total: lists.length };
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode === 403) {
      return {
        error: "forbidden",
        message:
          "Access denied to site lists. Ensure the app has Sites.Read.All permission.",
      };
    }
    return { error: "graph_error", message: e.message ?? String(err) };
  }
}
