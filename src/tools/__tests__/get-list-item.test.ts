import { getListItem } from "../get-list-item.js";
import { resolveSite } from "../resolve-site.js";
import { resolveList } from "../resolve-list.js";
import { getGraphClient } from "../../graph/client.js";

jest.mock("../resolve-site.js");
jest.mock("../resolve-list.js");
jest.mock("../../graph/client.js");

const mockResolveSite = resolveSite as jest.Mock;
const mockResolveList = resolveList as jest.Mock;
const mockGetGraphClient = getGraphClient as jest.Mock;

const MOCK_ITEM = {
  id: "5",
  fields: {
    "@odata.etag": "etag-5",
    id: "5",
    Title: "RFI-005",
    Status: "In Review",
    DueDate: "2026-07-01",
    Notes: "Awaiting architect response",
    AuthorLookupId: "12",
    EditorLookupId: "12",
    ContentType: "Item",
    Modified: "2026-03-10T00:00:00Z",
    Created: "2026-01-05T00:00:00Z",
    _UIVersionString: "1.0",
  },
};

function setupGraphMock(item = MOCK_ITEM) {
  const mockGet = jest.fn().mockResolvedValue(item);
  mockGetGraphClient.mockReturnValue({ api: jest.fn().mockReturnValue({ get: mockGet }) });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveSite.mockReturnValue({ siteId: "site-airtho", siteName: "airtho" });
  mockResolveList.mockResolvedValue({ _listId: "list-id-rfi", listDisplayName: "RFI Log" });
});

describe("getListItem", () => {
  it("returns a single item by sp_id with system fields stripped", async () => {
    setupGraphMock();
    const result = await getListItem({ list_name: "RFI Log", item_id: 5 });
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.item.sp_id).toBe(5);
      expect(result.item.Title).toBe("RFI-005");
      expect(result.item.Status).toBe("In Review");
      expect(result.item.Modified).toBe("2026-03-10T00:00:00Z"); // kept
      expect(result.item.Created).toBe("2026-01-05T00:00:00Z");  // kept
      // System fields stripped
      expect("AuthorLookupId" in result.item).toBe(false);
      expect("@odata.etag" in result.item).toBe(false);
      expect("ContentType" in result.item).toBe(false);
    }
  });

  it("returns only requested columns when specified", async () => {
    setupGraphMock();
    const result = await getListItem({ list_name: "RFI Log", item_id: 5, columns: ["Title", "Status"] });
    if (!("error" in result)) {
      expect(result.item.sp_id).toBe(5);
      expect(result.item.Title).toBe("RFI-005");
      expect(result.item.Status).toBe("In Review");
      expect("DueDate" in result.item).toBe(false);
      expect("Modified" in result.item).toBe(false);
    }
  });

  it("uses selective expand when columns specified", async () => {
    setupGraphMock();
    await getListItem({ list_name: "RFI Log", item_id: 5, columns: ["Title", "Status"] });
    const url = (mockGetGraphClient().api as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("fields($select=Title,Status)");
  });

  it("uses item_id in the URL path", async () => {
    setupGraphMock();
    await getListItem({ list_name: "RFI Log", item_id: 5 });
    const url = (mockGetGraphClient().api as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("/items/5");
  });

  it("returns list_name in response", async () => {
    setupGraphMock();
    const result = await getListItem({ list_name: "RFI Log", item_id: 5 });
    if (!("error" in result)) {
      expect(result.list_name).toBe("RFI Log");
    }
  });

  it("does not expose list IDs or site IDs", async () => {
    setupGraphMock();
    const result = await getListItem({ list_name: "RFI Log", item_id: 5 });
    const json = JSON.stringify(result);
    expect(json).not.toContain("list-id-rfi");
    expect(json).not.toContain("site-airtho");
  });

  it("returns not_found error on 404", async () => {
    const mockGet = jest.fn().mockRejectedValue({ statusCode: 404 });
    mockGetGraphClient.mockReturnValue({ api: jest.fn().mockReturnValue({ get: mockGet }) });
    const result = await getListItem({ list_name: "RFI Log", item_id: 999 });
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toBe("not_found");
  });

  it("returns error when resolveList fails", async () => {
    mockResolveList.mockResolvedValue({ error: "list_not_found", message: "No list" });
    const result = await getListItem({ list_name: "Nonexistent", item_id: 1 });
    expect("error" in result).toBe(true);
  });
});
