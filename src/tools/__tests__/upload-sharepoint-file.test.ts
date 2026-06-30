import { uploadSharePointFile } from "../upload-sharepoint-file.js";
import { resolveDrive } from "../resolve-drive.js";
import { resolveSiteUrl } from "../resolve-site-url.js";
import { getBearerToken } from "../../graph/client.js";

jest.mock("../resolve-drive.js");
jest.mock("../resolve-site-url.js");
jest.mock("../../graph/client.js");

const mockResolveDrive = resolveDrive as jest.Mock;
const mockResolveSiteUrl = resolveSiteUrl as jest.Mock;
const mockGetBearerToken = getBearerToken as jest.Mock;

const mockFetch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch as unknown as typeof fetch;
  mockResolveDrive.mockResolvedValue({ driveId: "drive-it-docs", driveName: "IT - Documents" });
  mockResolveSiteUrl.mockResolvedValue({ siteId: "site-it", siteName: "IT" });
  mockGetBearerToken.mockResolvedValue("graph-token");
});

describe("uploadSharePointFile", () => {
  it("uploads base64 file bytes to a SharePoint directory", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        id: "item-test",
        name: "test.txt",
        size: 11,
        file: { mimeType: "text/plain" },
        webUrl: "https://airtho.sharepoint.com/sites/IT/Shared%20Documents/test.txt",
      }),
    });

    const result = await uploadSharePointFile({
      drive_name: "IT - Documents",
      directory_path: "",
      filename: "test.txt",
      content_base64: Buffer.from("hello world").toString("base64"),
      content_type: "text/plain",
      userToken: "user-token",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://graph.microsoft.com/v1.0/drives/drive-it-docs/root:/test.txt:/content");
    expect(options).toMatchObject({
      method: "PUT",
      headers: {
        Authorization: "Bearer graph-token",
        "Content-Type": "text/plain",
      },
    });
    expect(Buffer.isBuffer(options.body)).toBe(true);
    expect(options.body.toString("utf8")).toBe("hello world");
    expect(result).toEqual({
      drive_name: "IT - Documents",
      path: "test.txt",
      item_id: "item-test",
      name: "test.txt",
      size: 11,
      mime_type: "text/plain",
      web_url: "https://airtho.sharepoint.com/sites/IT/Shared%20Documents/test.txt",
    });
  });

  it("encodes nested folder paths and filenames", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        id: "item-nested",
        name: "test file.txt",
        size: 5,
        file: { mimeType: "text/plain" },
      }),
    });

    await uploadSharePointFile({
      drive_name: "IT - Documents",
      directory_path: "Root Folder/Sub Folder",
      filename: "test file.txt",
      content_base64: Buffer.from("hello").toString("base64"),
      userToken: "user-token",
    });

    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://graph.microsoft.com/v1.0/drives/drive-it-docs/root:/Root%20Folder/Sub%20Folder/test%20file.txt:/content",
    );
  });

  it("uses site_url to resolve drives under a specific SharePoint site", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        id: "item-test",
        name: "test.txt",
        size: 5,
        file: { mimeType: "text/plain" },
      }),
    });

    await uploadSharePointFile({
      site_url: "https://airtho.sharepoint.com/sites/IT",
      drive_name: "Documents",
      directory_path: "",
      filename: "test.txt",
      content_base64: Buffer.from("hello").toString("base64"),
      userToken: "user-token",
    });

    expect(mockResolveSiteUrl).toHaveBeenCalledWith("https://airtho.sharepoint.com/sites/IT", "user-token");
    expect(mockResolveDrive).toHaveBeenCalledWith("Documents", "user-token", "site-it");
  });

  it("rejects missing filenames", async () => {
    const result = await uploadSharePointFile({
      drive_name: "IT - Documents",
      directory_path: "",
      filename: "",
      content_base64: Buffer.from("hello").toString("base64"),
      userToken: "user-token",
    });

    expect(result).toEqual({ error: "invalid_input", message: "filename must include a file name" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects simple uploads over 250 MB", async () => {
    const oversized = Buffer.alloc((250 * 1024 * 1024) + 1).toString("base64");

    const result = await uploadSharePointFile({
      drive_name: "IT - Documents",
      directory_path: "",
      filename: "too-large.bin",
      content_base64: oversized,
      userToken: "user-token",
    });

    expect(result).toEqual({
      error: "file_too_large",
      message: "Simple Graph uploads support files up to 250 MB. Use an upload session for larger files.",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns Graph upload errors with response details", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      text: jest.fn().mockResolvedValue("Forbidden"),
    });

    const result = await uploadSharePointFile({
      drive_name: "IT - Documents",
      directory_path: "",
      filename: "test.txt",
      content_base64: Buffer.from("hello").toString("base64"),
      userToken: "user-token",
    });

    expect(result).toEqual({ error: "graph_error", message: "Graph upload failed with 403: Forbidden" });
  });
});
