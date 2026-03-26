import { listLists } from "../list-lists.js";
import { resolveSite } from "../resolve-site.js";
import { getGraphClient } from "../../graph/client.js";

jest.mock("../resolve-site.js");
jest.mock("../../graph/client.js");

const mockResolveSite = resolveSite as jest.Mock;
const mockGetGraphClient = getGraphClient as jest.Mock;

const MOCK_LISTS = [
  {
    id: "list-id-rfi",
    name: "RFI Log",
    displayName: "RFI Log",
    description: "Request for information tracking",
    list: { hidden: false, template: "genericList" },
    columns: [
      { id: "col-1", name: "Title", displayName: "Title", hidden: false, text: {} },
      { id: "col-2", name: "Status", displayName: "Status", hidden: false, choice: { choices: ["Open", "Closed", "In Review"] } },
      { id: "col-3", name: "DueDate", displayName: "Due Date", hidden: false, dateTime: {} }, // internal ≠ display
      { id: "col-4", name: "_Hidden", displayName: "Hidden Field", hidden: true, text: {} },
    ],
  },
  {
    id: "list-id-co",
    name: "Change Orders",
    displayName: "Change Orders",
    list: { hidden: false, template: "genericList" },
    columns: [
      { id: "col-5", name: "Title", displayName: "Title", hidden: false, text: {} },
      { id: "col-6", name: "Amount", displayName: "Amount", hidden: false, currency: {} },
      { id: "col-7", name: "Approved", displayName: "Approved", hidden: false, boolean: {} },
    ],
  },
  {
    id: "list-id-doclib",
    name: "Documents",
    displayName: "Documents",
    list: { hidden: false, template: "documentLibrary" },
    columns: [],
  },
  {
    id: "list-id-hidden",
    name: "AppData",
    displayName: "AppData",
    list: { hidden: true, template: "genericList" },
    columns: [],
  },
];

function setupGraphMock(lists = MOCK_LISTS) {
  const mockGet = jest.fn().mockResolvedValue({ value: lists });
  mockGetGraphClient.mockReturnValue({ api: jest.fn().mockReturnValue({ get: mockGet }) });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveSite.mockReturnValue({ siteId: "site-airtho", siteName: "airtho" });
});

describe("listLists", () => {
  it("returns visible, non-library lists with columns", async () => {
    setupGraphMock();
    const result = await listLists({});
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.lists).toHaveLength(2); // excludes documentLibrary and hidden
      expect(result.total).toBe(2);
      expect(result.site_name).toBe("airtho");
    }
  });

  it("filters out hidden lists", async () => {
    setupGraphMock();
    const result = await listLists({});
    if (!("error" in result)) {
      const names = result.lists.map((l) => l.name);
      expect(names).not.toContain("AppData");
    }
  });

  it("filters out document library template lists", async () => {
    setupGraphMock();
    const result = await listLists({});
    if (!("error" in result)) {
      const names = result.lists.map((l) => l.name);
      expect(names).not.toContain("Documents");
    }
  });

  it("filters out hidden columns within lists", async () => {
    setupGraphMock();
    const result = await listLists({});
    if (!("error" in result)) {
      const rfi = result.lists.find((l) => l.name === "RFI Log");
      expect(rfi).toBeDefined();
      const colNames = rfi!.columns.map((c) => c.name);
      expect(colNames).not.toContain("Hidden Field");
    }
  });

  it("includes choice values for choice columns", async () => {
    setupGraphMock();
    const result = await listLists({});
    if (!("error" in result)) {
      const rfi = result.lists.find((l) => l.name === "RFI Log");
      const statusCol = rfi?.columns.find((c) => c.field_name === "Status");
      expect(statusCol?.type).toBe("choice");
      expect(statusCol?.choices).toEqual(["Open", "Closed", "In Review"]);
    }
  });

  it("exposes both display name and internal field_name on columns", async () => {
    setupGraphMock();
    const result = await listLists({});
    if (!("error" in result)) {
      const rfi = result.lists.find((l) => l.name === "RFI Log");
      const dueDateCol = rfi?.columns.find((c) => c.field_name === "DueDate");
      expect(dueDateCol?.name).toBe("Due Date");
      expect(dueDateCol?.field_name).toBe("DueDate");
    }
  });

  it("infers column types correctly", async () => {
    setupGraphMock();
    const result = await listLists({});
    if (!("error" in result)) {
      const co = result.lists.find((l) => l.name === "Change Orders");
      expect(co?.columns.find((c) => c.name === "Amount")?.type).toBe("currency");
      expect(co?.columns.find((c) => c.name === "Approved")?.type).toBe("boolean");
    }
  });

  it("includes description when present", async () => {
    setupGraphMock();
    const result = await listLists({});
    if (!("error" in result)) {
      const rfi = result.lists.find((l) => l.name === "RFI Log");
      expect(rfi?.description).toBe("Request for information tracking");
    }
  });

  it("omits description key when absent", async () => {
    setupGraphMock();
    const result = await listLists({});
    if (!("error" in result)) {
      const co = result.lists.find((l) => l.name === "Change Orders");
      expect("description" in (co ?? {})).toBe(false);
    }
  });

  it("does not include list IDs or site IDs in response", async () => {
    setupGraphMock();
    const result = await listLists({});
    const json = JSON.stringify(result);
    expect(json).not.toContain("list-id-rfi");
    expect(json).not.toContain("site-airtho");
    expect(json).not.toContain("col-1");
  });

  it("forwards site_name to resolveSite", async () => {
    setupGraphMock();
    await listLists({ site_name: "other-site" });
    expect(mockResolveSite).toHaveBeenCalledWith("other-site");
  });

  it("returns error when resolveSite fails", async () => {
    mockResolveSite.mockReturnValue({ error: "site_not_found", message: "No site" });
    const result = await listLists({});
    expect("error" in result).toBe(true);
  });

  it("returns forbidden error on 403", async () => {
    const mockGet = jest.fn().mockRejectedValue({ statusCode: 403, message: "Forbidden" });
    mockGetGraphClient.mockReturnValue({ api: jest.fn().mockReturnValue({ get: mockGet }) });
    const result = await listLists({});
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("forbidden");
    }
  });

  it("returns graph_error on other Graph failures", async () => {
    const mockGet = jest.fn().mockRejectedValue({ statusCode: 500, message: "Internal Server Error" });
    mockGetGraphClient.mockReturnValue({ api: jest.fn().mockReturnValue({ get: mockGet }) });
    const result = await listLists({});
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("graph_error");
    }
  });
});
