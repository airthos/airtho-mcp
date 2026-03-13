import { listVendors } from "../list-vendors.js";
import { resolveDrive } from "../resolve-drive.js";
import { getGraphClient } from "../../graph/client.js";

jest.mock("../resolve-drive.js");
jest.mock("../../graph/client.js");

const mockResolveDrive = resolveDrive as jest.Mock;
const mockGetGraphClient = getGraphClient as jest.Mock;

const MOCK_VENDOR_FOLDERS = [
  { id: "id-siemens", name: "Siemens", folder: {}, lastModifiedDateTime: "2026-01-01T00:00:00Z" },
  { id: "id-cleanair", name: "Clean Air Products", folder: {}, lastModifiedDateTime: "2026-01-02T00:00:00Z" },
  { id: "id-abm", name: "ABM Industries", folder: {}, lastModifiedDateTime: "2026-01-03T00:00:00Z" },
  { id: "id-file", name: "vendor-list.xlsx", file: { mimeType: "application/vnd.ms-excel" } },
];

function setupGraphMock(items = MOCK_VENDOR_FOLDERS) {
  const mockGet = jest.fn().mockResolvedValue({ value: items });
  mockGetGraphClient.mockReturnValue({ api: jest.fn().mockReturnValue({ get: mockGet }) });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveDrive.mockResolvedValue({ driveId: "drive-vendors", driveName: "Vendors" });
});

describe("listVendors", () => {
  it("returns all vendor folders when no keyword given", async () => {
    setupGraphMock();
    const result = await listVendors({});
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.vendors).toHaveLength(3); // excludes the file
      expect(result.query).toBeNull();
    }
  });

  it("filters by keyword", async () => {
    setupGraphMock();
    const result = await listVendors({ keyword: "clean" });
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.vendors).toHaveLength(1);
      expect(result.vendors[0].vendor_name).toBe("Clean Air Products");
    }
  });

  it("returns empty vendors when nothing matches", async () => {
    setupGraphMock();
    const result = await listVendors({ keyword: "nobody" });
    if (!("error" in result)) {
      expect(result.vendors).toHaveLength(0);
    }
  });

  it("does not include item_id in response", async () => {
    setupGraphMock();
    const result = await listVendors({});
    const json = JSON.stringify(result);
    expect(json).not.toMatch(/item_id/);
    expect(json).not.toMatch(/id-siemens/);
  });

  it("uses Vendors drive (not Jobs)", async () => {
    setupGraphMock();
    await listVendors({});
    expect(mockResolveDrive).toHaveBeenCalledWith("Vendors");
  });

  it("returns error when resolveDrive fails", async () => {
    mockResolveDrive.mockResolvedValue({ error: "drive_not_found", message: "No Vendors drive" });
    const result = await listVendors({ keyword: "siemens" });
    expect("error" in result).toBe(true);
  });
});
