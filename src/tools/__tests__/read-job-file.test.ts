import { readJobFile } from "../read-job-file.js";
import { resolveJob } from "../resolve-job.js";
import { getGraphClient } from "../../graph/client.js";
import { read } from "../read.js";

jest.mock("../resolve-job.js");
jest.mock("../../graph/client.js");
jest.mock("../read.js");

const mockResolveJob = resolveJob as jest.Mock;
const mockGetGraphClient = getGraphClient as jest.Mock;
const mockRead = read as jest.Mock;

const RESOLVED_JOB = {
  folder_name: "051 Factorial",
  job_number: "051",
  job_name: "Factorial",
  _driveId: "drive-jobs",
  _itemId: "id-051",
};

const MOCK_FILE_RESULT = {
  id: "id-rfp",
  name: "Factorial Dry Room RFP.docx",
  file: { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  size: 30024,
  lastModifiedDateTime: "2026-01-02T00:00:00Z",
};

const MOCK_READ_RESULT = {
  drive_name: "Jobs",
  file_name: "Factorial Dry Room RFP.docx",
  content: "RFP content here...",
  mime_type: "text/plain",
  truncated: false,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setupGraphMock(items: any[] = [MOCK_FILE_RESULT]) {
  const mockGet = jest.fn().mockResolvedValue({ value: items });
  mockGetGraphClient.mockReturnValue({ api: jest.fn().mockReturnValue({ get: mockGet }) });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveJob.mockResolvedValue(RESOLVED_JOB);
  mockRead.mockResolvedValue(MOCK_READ_RESULT);
});

describe("readJobFile", () => {
  it("resolves job and file then returns content", async () => {
    setupGraphMock();
    const result = await readJobFile({ job_keyword: "factorial", file_keyword: "RFP" });
    expect(result).toEqual(MOCK_READ_RESULT);
    // Verify read was called with internal item_id (not exposed in result)
    expect(mockRead).toHaveBeenCalledWith({ drive_name: "Jobs", item_id: "id-rfp" });
  });

  it("does not expose any item_id in the final response", async () => {
    setupGraphMock();
    const result = await readJobFile({ job_keyword: "factorial", file_keyword: "RFP" });
    const json = JSON.stringify(result);
    expect(json).not.toMatch(/id-rfp/);
    expect(json).not.toMatch(/id-051/);
  });

  it("returns file_not_found when search returns no files", async () => {
    setupGraphMock([]);
    const result = await readJobFile({ job_keyword: "factorial", file_keyword: "nonexistent" });
    expect((result as { error: string }).error).toBe("file_not_found");
  });

  it("returns file_not_found when results only contain folders", async () => {
    const folderOnly = [{ id: "id-folder", name: "Engineering", folder: {}, size: 0 }];
    setupGraphMock(folderOnly);
    const result = await readJobFile({ job_keyword: "factorial", file_keyword: "engineering" });
    expect((result as { error: string }).error).toBe("file_not_found");
  });

  it("returns error when resolveJob fails", async () => {
    mockResolveJob.mockResolvedValue({ error: "job_not_found", message: "No match" });
    const result = await readJobFile({ job_keyword: "unknown", file_keyword: "anything" });
    expect((result as { error: string }).error).toBe("job_not_found");
  });

  it("propagates read errors", async () => {
    setupGraphMock();
    mockRead.mockResolvedValue({ error: "unsupported_format", message: "PDF not supported", download_url: "https://..." });
    const result = await readJobFile({ job_keyword: "factorial", file_keyword: "report" });
    expect((result as { error: string }).error).toBe("unsupported_format");
  });
});
