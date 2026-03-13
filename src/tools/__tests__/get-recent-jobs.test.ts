import { getRecentJobs } from "../get-recent-jobs.js";
import { resolveDrive } from "../resolve-drive.js";
import { getGraphClient } from "../../graph/client.js";

jest.mock("../resolve-drive.js");
jest.mock("../../graph/client.js");

const mockResolveDrive = resolveDrive as jest.Mock;
const mockGetGraphClient = getGraphClient as jest.Mock;

// Pre-sorted newest-first as Graph would return with $orderby
const MOCK_FOLDERS = [
  { id: "id-1002", name: "1002 Warehouse fab & tool crib areas- Summer 2025", folder: {}, lastModifiedDateTime: "2026-03-09T19:44:46Z" },
  { id: "id-1001", name: "1001 Barbie cleanroom playhouse", folder: {}, lastModifiedDateTime: "2026-03-09T18:28:35Z" },
  { id: "id-1000", name: "1000 Demo Room", folder: {}, lastModifiedDateTime: "2026-01-15T00:00:00Z" },
  { id: "id-file", name: "readme.txt", file: { mimeType: "text/plain" } }, // should be excluded
];

function setupGraphMock(items = MOCK_FOLDERS) {
  const mockGet = jest.fn().mockResolvedValue({ value: items });
  mockGetGraphClient.mockReturnValue({ api: jest.fn().mockReturnValue({ get: mockGet }) });
  return mockGet;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveDrive.mockResolvedValue({ driveId: "drive-jobs", driveName: "Jobs" });
});

describe("getRecentJobs", () => {
  it("returns folders only, sorted by modified (newest first as returned by Graph)", async () => {
    setupGraphMock();
    const result = await getRecentJobs({});
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.jobs).toHaveLength(3); // excludes the file
      expect(result.jobs[0].folder_path).toBe("1002 Warehouse fab & tool crib areas- Summer 2025");
      expect(result.jobs[1].folder_path).toBe("1001 Barbie cleanroom playhouse");
    }
  });

  it("does not include item_id in response", async () => {
    setupGraphMock();
    const result = await getRecentJobs({});
    const json = JSON.stringify(result);
    expect(json).not.toMatch(/item_id/);
    expect(json).not.toMatch(/id-1002/);
  });

  it("passes limit to Graph API query", async () => {
    const mockGet = jest.fn().mockResolvedValue({ value: [] });
    const mockApi = jest.fn().mockReturnValue({ get: mockGet });
    mockGetGraphClient.mockReturnValue({ api: mockApi });

    await getRecentJobs({ limit: 5 });

    const calledUrl = mockApi.mock.calls[0][0] as string;
    expect(calledUrl).toContain("$top=5");
    expect(calledUrl).toContain("$orderby=lastModifiedDateTime desc");
  });

  it("parses job_number and job_name correctly", async () => {
    setupGraphMock();
    const result = await getRecentJobs({});
    if (!("error" in result)) {
      const demo = result.jobs.find((j) => j.folder_path === "1000 Demo Room");
      expect(demo?.job_number).toBe("1000");
      expect(demo?.job_name).toBe("Demo Room");
    }
  });

  it("returns error when resolveDrive fails", async () => {
    mockResolveDrive.mockResolvedValue({ error: "drive_not_found", message: "No drive" });
    const result = await getRecentJobs({});
    expect("error" in result).toBe(true);
  });
});
