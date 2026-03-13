import { getJob } from "../get-job.js";
import { resolveJob } from "../resolve-job.js";
import { getGraphClient } from "../../graph/client.js";

jest.mock("../resolve-job.js");
jest.mock("../../graph/client.js");

const mockResolveJob = resolveJob as jest.Mock;
const mockGetGraphClient = getGraphClient as jest.Mock;

const RESOLVED_JOB = {
  folder_name: "051 Factorial",
  job_number: "051",
  job_name: "Factorial",
  _driveId: "drive-jobs",
  _itemId: "id-051",
};

const MOCK_CONTENTS = [
  { id: "id-eng", name: "Engineering", folder: {}, lastModifiedDateTime: "2026-01-01T00:00:00Z", size: 2000000 },
  { id: "id-fin", name: "Finance & admin", folder: {}, lastModifiedDateTime: "2026-01-02T00:00:00Z", size: 500000 },
  { id: "id-pdf", name: "051-Factorial_ACIS.pdf", file: { mimeType: "application/pdf" }, lastModifiedDateTime: "2026-01-03T00:00:00Z", size: 842371 },
];

function setupGraphMock(items = MOCK_CONTENTS) {
  const mockGet = jest.fn().mockResolvedValue({ value: items });
  mockGetGraphClient.mockReturnValue({ api: jest.fn().mockReturnValue({ get: mockGet }) });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveJob.mockResolvedValue(RESOLVED_JOB);
});

describe("getJob", () => {
  it("returns job metadata and contents", async () => {
    setupGraphMock();
    const result = await getJob({ keyword: "factorial" });
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.job_number).toBe("051");
      expect(result.job_name).toBe("Factorial");
      expect(result.folder_path).toBe("051 Factorial");
      expect(result.contents).toHaveLength(3);
    }
  });

  it("returns folders before files in contents", async () => {
    setupGraphMock();
    const result = await getJob({ keyword: "factorial" });
    if (!("error" in result)) {
      const types = result.contents.map((c) => c.type);
      const lastFolderIdx = types.lastIndexOf("folder");
      const firstFileIdx = types.indexOf("file");
      expect(lastFolderIdx).toBeLessThan(firstFileIdx);
    }
  });

  it("does not include item_id in response", async () => {
    setupGraphMock();
    const result = await getJob({ keyword: "factorial" });
    const json = JSON.stringify(result);
    expect(json).not.toMatch(/item_id/);
    expect(json).not.toMatch(/id-eng/);
  });

  it("returns error when resolveJob fails", async () => {
    mockResolveJob.mockResolvedValue({ error: "job_not_found", message: "No job found" });
    const result = await getJob({ keyword: "unknown" });
    expect("error" in result).toBe(true);
  });

  it("returns error on Graph API failure", async () => {
    const mockGet = jest.fn().mockRejectedValue({ message: "network error" });
    mockGetGraphClient.mockReturnValue({ api: jest.fn().mockReturnValue({ get: mockGet }) });
    const result = await getJob({ keyword: "factorial" });
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("graph_error");
    }
  });
});
