import { searchJobs } from "../search-jobs.js";
import { resolveDrive } from "../resolve-drive.js";
import { getGraphClient } from "../../graph/client.js";

jest.mock("../resolve-drive.js");
jest.mock("../../graph/client.js");

const mockResolveDrive = resolveDrive as jest.Mock;
const mockGetGraphClient = getGraphClient as jest.Mock;

const MOCK_FOLDERS = [
  { id: "id-051", name: "051 Factorial", folder: {}, size: 7000000, lastModifiedDateTime: "2026-01-01T00:00:00Z" },
  { id: "id-062", name: "062 Factorial Phase2- Billerica", folder: {}, size: 1500000, lastModifiedDateTime: "2026-01-02T00:00:00Z" },
  { id: "id-1000", name: "1000 Demo Room", folder: {}, size: 4000000, lastModifiedDateTime: "2026-01-03T00:00:00Z" },
  { id: "id-file", name: "some-file.txt", file: { mimeType: "text/plain" }, size: 100 }, // files should be excluded
];

function setupGraphMock(items = MOCK_FOLDERS) {
  const mockGet = jest.fn().mockResolvedValue({ value: items });
  mockGetGraphClient.mockReturnValue({ api: jest.fn().mockReturnValue({ get: mockGet }) });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveDrive.mockResolvedValue({ driveId: "drive-jobs", driveName: "Jobs" });
});

describe("searchJobs", () => {
  it("returns all folders when no keyword given", async () => {
    setupGraphMock();
    const result = await searchJobs({});
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.matched_jobs).toHaveLength(3); // excludes the file
      expect(result.query).toBeNull();
    }
  });

  it("filters by keyword and returns matches sorted by score", async () => {
    setupGraphMock();
    const result = await searchJobs({ keyword: "factorial" });
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.matched_jobs).toHaveLength(2);
      expect(result.matched_jobs[0].folder_path).toBe("051 Factorial");
      expect(result.matched_jobs[1].folder_path).toBe("062 Factorial Phase2- Billerica");
    }
  });

  it("returns empty matched_jobs when nothing matches", async () => {
    setupGraphMock();
    const result = await searchJobs({ keyword: "nonexistent" });
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.matched_jobs).toHaveLength(0);
    }
  });

  it("does not include item_id in any response", async () => {
    setupGraphMock();
    const result = await searchJobs({ keyword: "factorial" });
    const json = JSON.stringify(result);
    expect(json).not.toMatch(/item_id/);
    expect(json).not.toMatch(/id-051/);
  });

  it("parses job_number and job_name correctly", async () => {
    setupGraphMock();
    const result = await searchJobs({ keyword: "demo" });
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.matched_jobs[0].job_number).toBe("1000");
      expect(result.matched_jobs[0].job_name).toBe("Demo Room");
    }
  });

  it("respects limit", async () => {
    setupGraphMock();
    const result = await searchJobs({ limit: 1 });
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.matched_jobs).toHaveLength(1);
    }
  });

  it("returns error when resolveDrive fails", async () => {
    mockResolveDrive.mockResolvedValue({ error: "drive_not_found", message: "No drive" });
    const result = await searchJobs({ keyword: "factorial" });
    expect("error" in result).toBe(true);
  });
});
