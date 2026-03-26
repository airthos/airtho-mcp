import { resolveSite, _resetSitesCache } from "../resolve-site.js";

beforeEach(() => {
  _resetSitesCache();
  delete process.env.DEFAULT_SITE_ID;
  delete process.env.SITES_JSON;
});

describe("resolveSite", () => {
  describe("single-site mode (no site_name)", () => {
    it("returns DEFAULT_SITE_ID with siteName 'default'", () => {
      process.env.DEFAULT_SITE_ID = "airtho.sharepoint.com,guid1,guid2";
      const result = resolveSite();
      expect("error" in result).toBe(false);
      if (!("error" in result)) {
        expect(result.siteId).toBe("airtho.sharepoint.com,guid1,guid2");
        expect(result.siteName).toBe("default");
      }
    });

    it("returns error when DEFAULT_SITE_ID is not set", () => {
      const result = resolveSite();
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error).toBe("missing_site_id");
      }
    });
  });

  describe("multi-site mode (site_name provided)", () => {
    const SITES = { airtho: "airtho.sharepoint.com,aaa,bbb", other: "other.sharepoint.com,ccc,ddd" };

    beforeEach(() => {
      process.env.SITES_JSON = JSON.stringify(SITES);
      _resetSitesCache();
    });

    it("resolves a known site by name", () => {
      const result = resolveSite("airtho");
      expect("error" in result).toBe(false);
      if (!("error" in result)) {
        expect(result.siteId).toBe(SITES.airtho);
        expect(result.siteName).toBe("airtho");
      }
    });

    it("is case-insensitive", () => {
      const result = resolveSite("AIRTHO");
      expect("error" in result).toBe(false);
      if (!("error" in result)) {
        expect(result.siteId).toBe(SITES.airtho);
      }
    });

    it("returns error for unknown site name", () => {
      const result = resolveSite("unknown-site");
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error).toBe("site_not_found");
        expect(result.message).toContain("airtho");
        expect(result.message).toContain("other");
      }
    });
  });

  describe("site_name provided but SITES_JSON not configured", () => {
    it("returns error with helpful message", () => {
      const result = resolveSite("airtho");
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error).toBe("site_not_found");
        expect(result.message).toContain("SITES_JSON");
      }
    });
  });

  it("does not expose site IDs (GUIDs) in error messages", () => {
    process.env.SITES_JSON = JSON.stringify({ airtho: "airtho.sharepoint.com,secret-guid,secret-guid2" });
    _resetSitesCache();
    const result = resolveSite("unknown");
    const json = JSON.stringify(result);
    expect(json).not.toContain("secret-guid");
  });
});
