import type { McpError } from "../types.js";

export interface ResolvedSite {
  siteId: string;
  siteName: string;
}

/** Parse SITES_JSON once per cold start. */
let _sitesCache: Record<string, string> | null = null;

function getSitesMap(): Record<string, string> {
  if (_sitesCache !== null) return _sitesCache;
  const raw = process.env.SITES_JSON;
  if (!raw) {
    _sitesCache = {};
    return _sitesCache;
  }
  try {
    _sitesCache = JSON.parse(raw) as Record<string, string>;
  } catch {
    _sitesCache = {};
  }
  return _sitesCache;
}

/** Exported for tests only — resets the module-level cache. */
export function _resetSitesCache(): void {
  _sitesCache = null;
}

/**
 * Resolve a human-readable site name to a Graph site ID.
 * - Omit site_name to use DEFAULT_SITE_ID (single-site / default mode).
 * - With SITES_JSON env var set, site_name maps to a configured site ID.
 *   SITES_JSON format: '{"airtho": "airtho.sharepoint.com,<guid>,<guid>"}'
 */
export function resolveSite(siteName?: string): ResolvedSite | McpError {
  if (!siteName) {
    const siteId = process.env.DEFAULT_SITE_ID;
    if (!siteId) {
      return {
        error: "missing_site_id",
        message:
          "DEFAULT_SITE_ID is not configured. Set DEFAULT_SITE_ID or provide a site_name with SITES_JSON configured.",
      };
    }
    return { siteId, siteName: "default" };
  }

  const sites = getSitesMap();
  const key = siteName.toLowerCase();
  const siteId = sites[key];

  if (!siteId) {
    const available = Object.keys(sites);
    if (available.length === 0) {
      return {
        error: "site_not_found",
        message: `SITES_JSON is not configured. Cannot resolve site '${siteName}'.`,
      };
    }
    return {
      error: "site_not_found",
      message: `No site named '${siteName}'. Available sites: ${available.join(", ")}`,
    };
  }

  return { siteId, siteName: key };
}
