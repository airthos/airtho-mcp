/**
 * MCP Server for Airtho SharePoint file transfer.
 *
 * Tool handlers read the per-request user token from AsyncLocalStorage
 * and pass it through to Graph for per-user SharePoint access.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getUserToken } from "./auth/token-store.js";

import { downloadSharePointFile } from "./tools/download-sharepoint-file.js";
import { uploadSharePointFile } from "./tools/upload-sharepoint-file.js";

function toResult(result: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

function getRequiredUserToken(): string | null {
  return getUserToken() ?? null;
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "airtho-mcp-server",
    version: "1.0.0",
  });

  // SharePoint file download

  server.tool(
    "airtho_download_sharepoint_file",
    "Download a SharePoint file from a document library. Returns base64 file bytes.",
    {
      site_url: z.string().describe("SharePoint site URL, e.g. 'https://airtho.sharepoint.com/sites/IT'. Omit to use the default site.").optional(),
      drive_name: z.string().describe("SharePoint document library name, e.g. 'Documents' or 'Jobs'"),
      path: z.string().describe("File path inside the document library. Prefer path over item_id.").optional(),
      item_id: z.string().describe("Graph driveItem ID. Use only if path is unavailable.").optional(),
    },
    async ({ site_url, drive_name, path, item_id }) => {
      const userToken = getRequiredUserToken();
      if (!userToken) {
        return toResult({ error: "auth_required", message: "Sign in before using SharePoint file tools" });
      }
      const result = await downloadSharePointFile({ site_url, drive_name, path, item_id, userToken });
      return toResult(result);
    },
  );

  // SharePoint file upload

  server.tool(
    "airtho_upload_sharepoint_file",
    "Upload base64 file bytes to a SharePoint document library directory. Replaces an existing file with the same name.",
    {
      site_url: z.string().describe("SharePoint site URL, e.g. 'https://airtho.sharepoint.com/sites/IT'. Omit to use the default site.").optional(),
      drive_name: z.string().describe("SharePoint document library name, e.g. 'Documents' or 'Jobs'"),
      directory_path: z.string().describe("Destination folder path inside the document library. Use empty string for root."),
      filename: z.string().describe("Destination file name, e.g. 'report.pdf'"),
      content_base64: z.string().describe("Base64-encoded file bytes to upload"),
      content_type: z.string().describe("Optional MIME type for the uploaded content").optional(),
    },
    async ({ site_url, drive_name, directory_path, filename, content_base64, content_type }) => {
      const userToken = getRequiredUserToken();
      if (!userToken) {
        return toResult({ error: "auth_required", message: "Sign in before using SharePoint file tools" });
      }
      const result = await uploadSharePointFile({
        site_url,
        drive_name,
        directory_path,
        filename,
        content_base64,
        content_type,
        userToken,
      });
      return toResult(result);
    },
  );

  return server;
}
