import { getGraphClient } from "../graph/client.js";
import type { McpError } from "../types.js";

interface GraphSite {
  id: string;
  name?: string;
  displayName?: string;
  webUrl?: string;
}

export interface ResolvedSiteUrl {
  siteId: string;
  siteName: string;
}

export async function resolveSiteUrl(siteUrl: string, userToken?: string): Promise<ResolvedSiteUrl | McpError> {
  let parsed: URL;

  try {
    parsed = new URL(siteUrl);
  } catch {
    return { error: "invalid_site_url", message: `Invalid SharePoint site URL '${siteUrl}'` };
  }

  if (!parsed.hostname.endsWith(".sharepoint.com")) {
    return { error: "invalid_site_url", message: "site_url must be a SharePoint site URL" };
  }

  const sitePath = parsed.pathname.replace(/\/+$/, "");
  if (!sitePath || sitePath === "/") {
    return { error: "invalid_site_url", message: "site_url must include a site path, e.g. /sites/IT" };
  }

  try {
    const client = getGraphClient(userToken);
    const site = await client
      .api(`/sites/${parsed.hostname}:${encodeURI(sitePath)}`)
      .get() as GraphSite;

    return {
      siteId: site.id,
      siteName: site.displayName ?? site.name ?? parsed.pathname.split("/").filter(Boolean).pop() ?? "site",
    };
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode === 404) {
      return { error: "site_not_found", message: `No SharePoint site found at '${siteUrl}'` };
    }
    return { error: "graph_error", message: e.message ?? String(err) };
  }
}
