import { getListItems } from "../get-list-items.js";
import { resolveSite } from "../resolve-site.js";
import { resolveList } from "../resolve-list.js";
import { getGraphClient } from "../../graph/client.js";

jest.mock("../resolve-site.js");
jest.mock("../resolve-list.js");
jest.mock("../../graph/client.js");

const mockResolveSite = resolveSite as jest.Mock;
const mockResolveList = resolveList as jest.Mock;
const mockGetGraphClient = getGraphClient as jest.Mock;

const MOCK_ITEMS = [
  {
    id: "3",
    fields: {
      "@odata.etag": "etag-3",
      id: "3",
      Title: "RFI-003",
      Status: "Open",
      DueDate: "2026-06-01",
      AuthorLookupId: "12",
      EditorLookupId: "12",
      ContentType: "Item",
      Modified: "2026-03-01T00:00:00Z",
      _UIVersionString: "1.0",
      Attachments: false,
    },
  },
  {
    id: "7",
    fields: {
      "@odata.etag": "etag-7",
      id: "7",
      Title: "RFI-007",
      Status: "Closed",
      DueDate: "2026-03-15",
      AuthorLookupId: "12",
      EditorLookupId: "12",
      ContentType: "Item",
      Modified: "2026-02-01T00:00:00Z",
      _UIVersionString: "1.0",
      Attachments: false,
    },
  },
];

function setupGraphMock(items = MOCK_ITEMS, hasMore = false) {
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

describe("getListItems", () => {
  it("returns items with system fields stripped", async () => {
    setupGraphMock();
    const result = await getListItems({ list_name: "RFI Log" });
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.items).toHaveLength(2);
      const item = result.items[0];
      expect(item.sp_id).toBe(3);
      expect(item.Title).toBe("RFI-003");
      expect(item.Status).toBe("Open");
      expect(item.Modified).toBe("2026-03-01T00:00:00Z"); // kept
      // System fields stripped
      expect("AuthorLookupId" in item).toBe(false);
      expect("EditorLookupId" in item).toBe(false);
      expect("ContentType" in item).toBe(false);
      expect("_UIVersionString" in item).toBe(false);
      expect("Attachments" in item).toBe(false);
      expect("@odata.etag" in item).toBe(false);
    }
  });

  it("returns only requested columns when columns param provided", async () => {
    setupGraphMock();
    const result = await getListItems({ list_name: "RFI Log", columns: ["Title", "Status"] });
    if (!("error" in result)) {
      const item = result.items[0];
      expect(item.sp_id).toBe(3);
      expect(item.Title).toBe("RFI-003");
      expect(item.Status).toBe("Open");
      expect("DueDate" in item).toBe(false);
      expect("Modified" in item).toBe(false);
    }
  });

  it("filters by field/value when filter_field and filter_value provided", async () => {
    const mockGet = jest.fn().mockResolvedValue({ value: [MOCK_ITEMS[0]] });
    mockGetGraphClient.mockReturnValue({
      api: jest.fn().mockReturnValue({ header: jest.fn().mockReturnValue({ get: mockGet }) }),
    });
    const result = await getListItems({
      list_name: "RFI Log",
      filter_field: "Status",
      filter_value: "Open",
    });
    if (!("error" in result)) {
      expect(result.items).toHaveLength(1);
      const url = (mockGetGraphClient().api as jest.Mock).mock.calls[0][0] as string;
      expect(url).toContain("fields/Status eq 'Open'");
    }
  });

  it("includes $expand=fields in the API URL", async () => {
    setupGraphMock();
    await getListItems({ list_name: "RFI Log" });
    const url = (mockGetGraphClient().api as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("$expand=fields");
  });

  it("uses selective expand when columns specified", async () => {
    setupGraphMock();
    await getListItems({ list_name: "RFI Log", columns: ["Title", "Status"] });
    const url = (mockGetGraphClient().api as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("fields($select=Title,Status)");
  });

  it("respects limit param", async () => {
    setupGraphMock();
    await getListItems({ list_name: "RFI Log", limit: 10 });
    const url = (mockGetGraphClient().api as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("$top=10");
  });

  it("reports has_more when nextLink present", async () => {
    setupGraphMock(MOCK_ITEMS, true);
    const result = await getListItems({ list_name: "RFI Log" });
    if (!("error" in result)) {
      expect(result.has_more).toBe(true);
    }
  });

  it("reports has_more false when no nextLink", async () => {
    setupGraphMock(MOCK_ITEMS, false);
    const result = await getListItems({ list_name: "RFI Log" });
    if (!("error" in result)) {
      expect(result.has_more).toBe(false);
    }
  });

  it("does not expose list IDs or site IDs", async () => {
    setupGraphMock();
    const result = await getListItems({ list_name: "RFI Log" });
    const json = JSON.stringify(result);
    expect(json).not.toContain("list-id-rfi");
    expect(json).not.toContain("site-airtho");
  });

  it("returns error when resolveSite fails", async () => {
    mockResolveSite.mockReturnValue({ error: "missing_site_id", message: "No site" });
    const result = await getListItems({ list_name: "RFI Log" });
    expect("error" in result).toBe(true);
  });

  it("returns error when resolveList fails", async () => {
    mockResolveList.mockResolvedValue({ error: "list_not_found", message: "No list" });
    const result = await getListItems({ list_name: "Nonexistent" });
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toBe("list_not_found");
  });

  it("returns forbidden error on 403", async () => {
    const mockGet = jest.fn().mockRejectedValue({ statusCode: 403 });
    mockGetGraphClient.mockReturnValue({
      api: jest.fn().mockReturnValue({ header: jest.fn().mockReturnValue({ get: mockGet }) }),
    });
    const result = await getListItems({ list_name: "RFI Log" });
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toBe("forbidden");
  });
});
