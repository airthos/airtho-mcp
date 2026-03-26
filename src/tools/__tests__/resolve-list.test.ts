import { resolveList, _resetListCache } from "../resolve-list.js";
import { getGraphClient } from "../../graph/client.js";

jest.mock("../../graph/client.js");
const mockGetGraphClient = getGraphClient as jest.Mock;

const MOCK_LISTS = [
  { id: "id-rfi", name: "RFILog", displayName: "RFI Log" },
  { id: "id-co", name: "ChangeOrders", displayName: "Change Orders" },
];

function setupGraphMock(lists = MOCK_LISTS) {
  const mockGet = jest.fn().mockResolvedValue({ value: lists });
  mockGetGraphClient.mockReturnValue({ api: jest.fn().mockReturnValue({ get: mockGet }) });
}

beforeEach(() => {
  _resetListCache();
  jest.clearAllMocks();
});

describe("resolveList", () => {
  it("resolves by display name (case-insensitive)", async () => {
    setupGraphMock();
    const result = await resolveList("site-id", "rfi log");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.listDisplayName).toBe("RFI Log");
    }
  });

  it("resolves by internal name when display name doesn't match", async () => {
    setupGraphMock();
    const result = await resolveList("site-id", "changeorders");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.listDisplayName).toBe("Change Orders");
    }
  });

  it("prefers display name match over internal name", async () => {
    // Scenario: one list has internal name that matches another's displayName
    setupGraphMock([
      { id: "id-a", name: "RFI Log", displayName: "RFI Tracker" },
      { id: "id-b", name: "Other", displayName: "RFI Log" },
    ]);
    const result = await resolveList("site-id", "rfi log");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.listDisplayName).toBe("RFI Log"); // matched by displayName
    }
  });

  it("returns error for unknown list", async () => {
    setupGraphMock();
    const result = await resolveList("site-id", "no such list");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("list_not_found");
      expect(result.message).toContain("RFI Log");
      expect(result.message).toContain("Change Orders");
    }
  });

  it("caches lists per site — only one Graph call for multiple resolves", async () => {
    setupGraphMock();
    await resolveList("site-id", "rfi log");
    await resolveList("site-id", "change orders");
    expect(mockGetGraphClient).toHaveBeenCalledTimes(1);
  });

  it("makes separate Graph calls for different sites", async () => {
    setupGraphMock();
    await resolveList("site-a", "rfi log");
    await resolveList("site-b", "rfi log");
    expect(mockGetGraphClient).toHaveBeenCalledTimes(2);
  });

  it("does not expose list IDs in error messages", async () => {
    setupGraphMock();
    const result = await resolveList("site-id", "unknown");
    const json = JSON.stringify(result);
    expect(json).not.toContain("id-rfi");
    expect(json).not.toContain("id-co");
  });

  it("returns error on Graph API failure", async () => {
    const mockGet = jest.fn().mockRejectedValue({ statusCode: 500, message: "Server error" });
    mockGetGraphClient.mockReturnValue({ api: jest.fn().mockReturnValue({ get: mockGet }) });
    const result = await resolveList("site-id", "rfi log");
    expect("error" in result).toBe(true);
  });
});
