import { searchList } from "../search-list.js";
import { resolveSite } from "../resolve-site.js";
import { resolveList } from "../resolve-list.js";
import { getGraphClient } from "../../graph/client.js";

jest.mock("../resolve-site.js");
jest.mock("../resolve-list.js");
jest.mock("../../graph/client.js");

const mockResolveSite = resolveSite as jest.Mock;
const mockResolveList = resolveList as jest.Mock;
const mockGetGraphClient = getGraphClient as jest.Mock;

type MockItem = { id: string; fields: Record<string, unknown> };

const MOCK_ITEMS: MockItem[] = [
  {
    id: "1",
    fields: { id: "1", Title: "Factorial HVAC RFI", Status: "Open", Notes: "Pending from Factorial job" },
  },
  {
    id: "2",
    fields: { id: "2", Title: "Demo Room Lighting", Status: "Closed", Notes: "Completed" },
  },
  {
    id: "3",
    fields: { id: "3", Title: "Billerica Site Visit", Status: "Open", Notes: "Factorial Phase 2" },
  },
];

function setupGraphMock(items: MockItem[] = MOCK_ITEMS, hasMore = false) {
  const mockGet = jest.fn().mockResolvedValue({
    value: items,
    ...(hasMore ? { "@odata.nextLink": "https://graph.microsoft.com/next" } : {}),
  });
  mockGetGraphClient.mockReturnValue({
    api: jest.fn().mockReturnValue({ header: jest.fn().mockReturnValue({ get: mockGet }) }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveSite.mockReturnValue({ siteId: "site-airtho", siteName: "airtho" });
  mockResolveList.mockResolvedValue({ _listId: "list-id-rfi", listDisplayName: "RFI Log" });
});

describe("searchList", () => {
  it("returns items where keyword appears in any field", async () => {
    setupGraphMock();
    const result = await searchList({ list_name: "RFI Log", keyword: "factorial" });
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.total_matches).toBe(2); // item 1 (Title + Notes) and item 3 (Notes)
      expect(result.keyword).toBe("factorial");
    }
  });

  it("is case-insensitive", async () => {
    setupGraphMock();
    const result = await searchList({ list_name: "RFI Log", keyword: "FACTORIAL" });
    if (!("error" in result)) {
      expect(result.total_matches).toBe(2);
    }
  });

  it("returns only matched_fields for each match", async () => {
    setupGraphMock();
    const result = await searchList({ list_name: "RFI Log", keyword: "factorial" });
    if (!("error" in result)) {
      const match = result.matches.find((m) => m.sp_id === 1);
      expect(match).toBeDefined();
      // Title and Notes both contain "factorial"
      expect("Title" in match!.matched_fields).toBe(true);
      expect("Notes" in match!.matched_fields).toBe(true);
      // Status does not
      expect("Status" in match!.matched_fields).toBe(false);
    }
  });

  it("exposes sp_id and title on each match", async () => {
    setupGraphMock();
    const result = await searchList({ list_name: "RFI Log", keyword: "demo" });
    if (!("error" in result)) {
      expect(result.matches[0].sp_id).toBe(2);
      expect(result.matches[0].title).toBe("Demo Room Lighting");
    }
  });

  it("returns empty matches when nothing found", async () => {
    setupGraphMock();
    const result = await searchList({ list_name: "RFI Log", keyword: "zzznomatch" });
    if (!("error" in result)) {
      expect(result.total_matches).toBe(0);
      expect(result.matches).toHaveLength(0);
    }
  });

  it("respects limit on number of matches returned", async () => {
    setupGraphMock();
    const result = await searchList({ list_name: "RFI Log", keyword: "open", limit: 1 });
    if (!("error" in result)) {
      expect(result.matches.length).toBeLessThanOrEqual(1);
    }
  });

  it("reports searched_items count and has_more", async () => {
    setupGraphMock(MOCK_ITEMS, true);
    const result = await searchList({ list_name: "RFI Log", keyword: "factorial" });
    if (!("error" in result)) {
      expect(result.searched_items).toBe(3);
      expect(result.has_more).toBe(true);
    }
  });

  it("does not include system fields in matched_fields", async () => {
    setupGraphMock([{ id: "1", fields: { id: "1", Title: "Test", AuthorLookupId: "factorial", ContentType: "factorial item" } }]);
    const result = await searchList({ list_name: "RFI Log", keyword: "factorial" });
    if (!("error" in result)) {
      // System fields should not appear even if they contain the keyword
      const match = result.matches[0];
      expect(match).toBeUndefined(); // no user fields matched
    }
  });

  it("does not expose list IDs or site IDs", async () => {
    setupGraphMock();
    const result = await searchList({ list_name: "RFI Log", keyword: "factorial" });
    const json = JSON.stringify(result);
    expect(json).not.toContain("list-id-rfi");
    expect(json).not.toContain("site-airtho");
  });

  it("returns error when resolveList fails", async () => {
    mockResolveList.mockResolvedValue({ error: "list_not_found", message: "No list" });
    const result = await searchList({ list_name: "Nonexistent", keyword: "test" });
    expect("error" in result).toBe(true);
  });
});
