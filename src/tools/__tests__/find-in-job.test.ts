import { findInJob } from "../find-in-job.js";
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

const MOCK_SEARCH_RESULTS = [
  {
    id: "id-meeting",
    name: "Factorial_Meeting-Redesign to Lab_241018.docx",
    file: { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    size: 46779,
    lastModifiedDateTime: "2026-01-01T00:00:00Z",
    parentReference: { path: "/drives/abc/root:/051 Factorial" },
  },
  {
    id: "id-rfp",
    name: "Factorial Dry Room RFP.docx",
    file: { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    size: 30024,
    lastModifiedDateTime: "2026-01-02T00:00:00Z",
    parentReference: { path: "/drives/abc/root:/051 Factorial/Finance & admin" },
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setupGraphMock(items: any[] = MOCK_SEARCH_RESULTS) {
  const mockGet = jest.fn().mockResolvedValue({ value: items });
  mockGetGraphClient.mockReturnValue({ api: jest.fn().mockReturnValue({ get: mockGet }) });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveJob.mockResolvedValue(RESOLVED_JOB);
});

describe("findInJob", () => {
  it("returns matching files with paths", async () => {
    setupGraphMock();
    const result = await findInJob({ job_keyword: "factorial", file_keyword: "meeting" });
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.job).toBe("051 Factorial");
      expect(result.query).toBe("meeting");
      expect(result.results).toHaveLength(2);
      expect(result.results[0].name).toBe("Factorial_Meeting-Redesign to Lab_241018.docx");
    }
  });

  it("does not include item_id in response", async () => {
    setupGraphMock();
    const result = await findInJob({ job_keyword: "factorial", file_keyword: "meeting" });
    const json = JSON.stringify(result);
    expect(json).not.toMatch(/item_id/);
    expect(json).not.toMatch(/id-meeting/);
  });

  it("returns empty results when nothing found", async () => {
    setupGraphMock([]);
    const result = await findInJob({ job_keyword: "factorial", file_keyword: "nothing" });
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.results).toHaveLength(0);
      expect(result.has_more).toBe(false);
    }
  });

  it("excludes folders from results", async () => {
    const itemsWithFolder = [
      ...MOCK_SEARCH_RESULTS,
      { id: "id-folder", name: "Engineering", folder: {}, size: 0, lastModifiedDateTime: "2026-01-01T00:00:00Z" },
    ];
    setupGraphMock(itemsWithFolder);
    const result = await findInJob({ job_keyword: "factorial", file_keyword: "engineering" });
    if (!("error" in result)) {
      const names = result.results.map((r) => r.name);
      expect(names).not.toContain("Engineering");
    }
  });

  it("respects limit and sets has_more", async () => {
    // Return limit+1 items to trigger has_more
    const manyItems = Array.from({ length: 6 }, (_, i) => ({
      id: `id-${i}`,
      name: `file-${i}.docx`,
      file: { mimeType: "text/plain" },
      size: 100,
      lastModifiedDateTime: "2026-01-01T00:00:00Z",
      parentReference: { path: "/drives/abc/root:/051 Factorial" },
    }));
    setupGraphMock(manyItems);
    const result = await findInJob({ job_keyword: "factorial", file_keyword: "file", limit: 5 });
    if (!("error" in result)) {
      expect(result.results).toHaveLength(5);
      expect(result.has_more).toBe(true);
    }
  });

  it("returns error when resolveJob fails", async () => {
    mockResolveJob.mockResolvedValue({ error: "job_not_found", message: "No match" });
    const result = await findInJob({ job_keyword: "unknown", file_keyword: "anything" });
    expect("error" in result).toBe(true);
  });
});
