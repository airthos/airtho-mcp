import { resolveJob } from "../resolve-job.js";
import { resolveDrive } from "../resolve-drive.js";
import { getGraphClient } from "../../graph/client.js";

jest.mock("../resolve-drive.js");
jest.mock("../../graph/client.js");

const mockResolveDrive = resolveDrive as jest.Mock;
const mockGetGraphClient = getGraphClient as jest.Mock;

const MOCK_FOLDERS = [
  { id: "id-051", name: "051 Factorial", folder: {}, lastModifiedDateTime: "2026-01-01T00:00:00Z" },
  { id: "id-062", name: "062 Factorial Phase2- Billerica", folder: {}, lastModifiedDateTime: "2026-01-02T00:00:00Z" },
  { id: "id-1000", name: "1000 Demo Room", folder: {}, lastModifiedDateTime: "2026-01-03T00:00:00Z" },
  { id: "id-1001", name: "1001 Barbie cleanroom playhouse", folder: {}, lastModifiedDateTime: "2026-01-04T00:00:00Z" },
];

function setupGraphMock(folders = MOCK_FOLDERS) {
  const mockGet = jest.fn().mockResolvedValue({ value: folders });
  mockGetGraphClient.mockReturnValue({ api: jest.fn().mockReturnValue({ get: mockGet }) });
  return mockGet;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveDrive.mockResolvedValue({ driveId: "drive-jobs", driveName: "Jobs" });
});

describe("resolveJob", () => {
  it("returns the best-matching job", async () => {
    setupGraphMock();
    const result = await resolveJob("factorial");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.folder_name).toBe("051 Factorial");
      expect(result.job_number).toBe("051");
      expect(result.job_name).toBe("Factorial");
      expect(result._itemId).toBe("id-051");
      expect(result._driveId).toBe("drive-jobs");
    }
  });

  it("prefers exact word match over substring match", async () => {
    setupGraphMock();
    // "billerica" only appears in the phase 2 job
    const result = await resolveJob("billerica");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.folder_name).toBe("062 Factorial Phase2- Billerica");
    }
  });

  it("returns job_not_found error when nothing matches", async () => {
    setupGraphMock();
    const result = await resolveJob("nonexistent project xyz");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("job_not_found");
    }
  });

  it("returns error when resolveDrive fails", async () => {
    mockResolveDrive.mockResolvedValue({ error: "drive_not_found", message: "No such drive" });
    const result = await resolveJob("factorial");
    expect("error" in result).toBe(true);
  });

  it("returns error on Graph API failure", async () => {
    const mockGet = jest.fn().mockRejectedValue({ message: "Graph API error" });
    mockGetGraphClient.mockReturnValue({ api: jest.fn().mockReturnValue({ get: mockGet }) });
    const result = await resolveJob("factorial");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("graph_error");
    }
  });
});
