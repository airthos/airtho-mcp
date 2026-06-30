import { downloadSharePointFile } from "../download-sharepoint-file.js";
import { resolveDrive } from "../resolve-drive.js";
import { resolveSiteUrl } from "../resolve-site-url.js";
import { getBearerToken, getGraphClient } from "../../graph/client.js";

jest.mock("../resolve-drive.js");
jest.mock("../resolve-site-url.js");
jest.mock("../../graph/client.js");

const mockResolveDrive = resolveDrive as jest.Mock;
const mockResolveSiteUrl = resolveSiteUrl as jest.Mock;
const mockGetGraphClient = getGraphClient as jest.Mock;
const mockGetBearerToken = getBearerToken as jest.Mock;

const mockFetch = jest.fn();

function cleanArrayBuffer(bytes: Buffer): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch as unknown as typeof fetch;
  mockResolveDrive.mockResolvedValue({ driveId: "drive-it-docs", driveName: "IT - Documents" });
  mockResolveSiteUrl.mockResolvedValue({ siteId: "site-it", siteName: "IT" });
  mockGetBearerToken.mockResolvedValue("graph-token");
});

describe("downloadSharePointFile", () => {
  it("downloads a file by path and returns base64 bytes", async () => {
    const api = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({
        id: "item-test",
        name: "test.txt",
        file: { mimeType: "text/plain" },
        size: 11,
      }),
    });
    mockGetGraphClient.mockReturnValue({ api });
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: jest.fn().mockReturnValue("text/plain") },
      arrayBuffer: jest.fn().mockResolvedValue(cleanArrayBuffer(Buffer.from("hello world"))),
    });

    const result = await downloadSharePointFile({
      drive_name: "IT - Documents",
      path: "test.txt",
      userToken: "user-token",
    });

    expect(api).toHaveBeenCalledWith("/drives/drive-it-docs/root:/test.txt");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://graph.microsoft.com/v1.0/drives/drive-it-docs/items/item-test/content",
      { headers: { Authorization: "Bearer graph-token" } },
    );
    expect(result).toMatchObject({
      drive_name: "IT - Documents",
      path: "test.txt",
      item_id: "item-test",
      name: "test.txt",
      mime_type: "text/plain",
      content_base64: Buffer.from("hello world").toString("base64"),
    });
  });

  it("downloads a file by item_id", async () => {
    const api = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({
        id: "item-123",
        name: "binary.bin",
        file: { mimeType: "application/octet-stream" },
        size: 3,
      }),
    });
    mockGetGraphClient.mockReturnValue({ api });
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: jest.fn().mockReturnValue("application/octet-stream") },
      arrayBuffer: jest.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer),
    });

    const result = await downloadSharePointFile({
      drive_name: "IT - Documents",
      item_id: "item-123",
      userToken: "user-token",
    });

    expect(api).toHaveBeenCalledWith("/drives/drive-it-docs/items/item-123");
    expect(result).toMatchObject({ item_id: "item-123", content_base64: "AQID" });
  });

  it("uses site_url to resolve drives under a specific SharePoint site", async () => {
    const api = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({
        id: "item-test",
        name: "test.txt",
        file: { mimeType: "text/plain" },
        size: 5,
      }),
    });
    mockGetGraphClient.mockReturnValue({ api });
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: jest.fn().mockReturnValue("text/plain") },
      arrayBuffer: jest.fn().mockResolvedValue(cleanArrayBuffer(Buffer.from("hello"))),
    });

    await downloadSharePointFile({
      site_url: "https://airtho.sharepoint.com/sites/IT",
      drive_name: "Documents",
      path: "test.txt",
      userToken: "user-token",
    });

    expect(mockResolveSiteUrl).toHaveBeenCalledWith("https://airtho.sharepoint.com/sites/IT", "user-token");
    expect(mockResolveDrive).toHaveBeenCalledWith("Documents", "user-token", "site-it");
  });

  it("rejects requests without a path or item_id", async () => {
    const result = await downloadSharePointFile({ drive_name: "IT - Documents", userToken: "user-token" });
    expect(result).toEqual({ error: "missing_target", message: "Provide either path or item_id" });
  });

  it("rejects folders", async () => {
    mockGetGraphClient.mockReturnValue({
      api: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ id: "folder-1", name: "Folder", folder: {} }),
      }),
    });

    const result = await downloadSharePointFile({
      drive_name: "IT - Documents",
      path: "Folder",
      userToken: "user-token",
    });

    expect(result).toEqual({ error: "not_a_file", message: "'Folder' is a folder, not a file" });
  });

  it("returns Graph download errors with response details", async () => {
    mockGetGraphClient.mockReturnValue({
      api: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ id: "item-test", name: "test.txt", file: { mimeType: "text/plain" } }),
      }),
    });
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      text: jest.fn().mockResolvedValue("Forbidden"),
    });

    const result = await downloadSharePointFile({
      drive_name: "IT - Documents",
      path: "test.txt",
      userToken: "user-token",
    });

    expect(result).toEqual({ error: "graph_error", message: "Graph download failed with 403: Forbidden" });
  });
});
