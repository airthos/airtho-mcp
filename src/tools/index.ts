import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listDrives } from "./list-drives.js";
import { listDriveChildren } from "./list-drive-children.js";
import { getItemByPath } from "./get-item-by-path.js";
import { searchWithinFolder } from "./search-within-folder.js";
import { getFileMetadata } from "./get-file-metadata.js";
import { readFileContent } from "./read-file-content.js";
import type { McpError } from "../types.js";

function isError(result: unknown): result is McpError {
  return typeof result === "object" && result !== null && "error" in result;
}

function toResponse(result: unknown) {
  const text = JSON.stringify(result, null, 2);
  if (isError(result)) {
    return { isError: true, content: [{ type: "text" as const, text }] };
  }
  return { content: [{ type: "text" as const, text }], structuredContent: result as Record<string, unknown> };
}

export function registerTools(server: McpServer): void {
  // ── airtho_list_drives ──────────────────────────────────────────────────────
  server.registerTool(
    "airtho_list_drives",
    {
      title: "List Airtho SharePoint Drives",
      description: `List available document library drives on an Airtho SharePoint site.

Use this once during setup or orientation to discover drive IDs for subsequent calls.

Args:
  - site_id (string, optional): SharePoint site ID. Omit to use the server-configured DEFAULT_SITE_ID.

Returns:
  Array of { drive_id, name, drive_type } — record the drive_id values in the skill for reuse.

Examples:
  - Use when: discovering which document library to target
  - Don't use when: you already know the drive_id (use list/search tools directly)

Errors:
  - site_not_found: site ID is invalid or the app registration lacks Sites.Read.All consent
  - missing_site_id: no site_id provided and DEFAULT_SITE_ID is not configured`,
      inputSchema: z.object({
        site_id: z.string().optional().describe("SharePoint site ID. Omit to use the server default."),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => toResponse(await listDrives(args))
  );

  // ── airtho_list_drive_children ──────────────────────────────────────────────
  server.registerTool(
    "airtho_list_drive_children",
    {
      title: "List Drive Folder Children",
      description: `List the immediate children (files and folders) of a folder in a SharePoint drive.

Args:
  - drive_id (string): The drive ID (obtain from airtho_list_drives)
  - item_id (string): The folder's Graph item ID. Use 'root' to list the drive root.
  - limit (number, optional): Max items to return, 1–200 (default: 50)
  - offset (number, optional): Items to skip for pagination (default: 0)

Returns:
  { items: [{ name, id, type ('file'|'folder'), modified, size }], has_more, total_returned }

Examples:
  - Use when: enumerating job folders at the root, listing subfolders inside a job
  - Use 'root' as item_id to start at drive root

Errors:
  - item_not_found: folder item ID not found in this drive
  - drive_not_found: drive ID is not accessible`,
      inputSchema: z.object({
        drive_id: z.string().describe("The drive ID"),
        item_id: z.string().describe("Folder item ID, or 'root' for the drive root"),
        limit: z.number().int().min(1).max(200).default(50).describe("Max items to return (default: 50)"),
        offset: z.number().int().min(0).default(0).describe("Items to skip for pagination (default: 0)"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => toResponse(await listDriveChildren(args))
  );

  // ── airtho_get_item_by_path ─────────────────────────────────────────────────
  server.registerTool(
    "airtho_get_item_by_path",
    {
      title: "Get Drive Item by Path",
      description: `Resolve a path string to a Graph item ID and metadata. Use to navigate to known folder paths without iterating children.

Args:
  - drive_id (string): The drive ID
  - path (string): Path relative to drive root, e.g. 'Jobs/2024-001 Acme Corp'

Returns:
  { name, id, type ('file'|'folder'), modified, size, parent_id }

Examples:
  - Use when: you know the expected folder path and want its item ID for further calls
  - path='Jobs/2025-042 Northgate' → returns item metadata including id

Errors:
  - item_not_found: no item exists at the specified path
  - drive_not_found: drive ID is not accessible`,
      inputSchema: z.object({
        drive_id: z.string().describe("The drive ID"),
        path: z.string().min(1).describe("Path relative to drive root, e.g. 'Jobs/2024-001 Acme Corp'"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => toResponse(await getItemByPath(args))
  );

  // ── airtho_search_within_folder ─────────────────────────────────────────────
  server.registerTool(
    "airtho_search_within_folder",
    {
      title: "Search Within Drive Folder",
      description: `Search for files by keyword within a specific folder subtree. Scoped to the provided folder — not tenant-wide.

Args:
  - drive_id (string): The drive ID
  - item_id (string): Folder item ID to scope the search to (use the root jobs folder to search all jobs)
  - query (string): Search keyword(s) — matches file names and indexed content
  - limit (number, optional): Max results to return, 1–200 (default: 50)

Returns:
  { results: [{ name, id, path, modified, size }], has_more, total_returned }

Examples:
  - Use when: finding a file by name or content keyword within a job folder
  - query='invoice' within a job folder → returns all files matching 'invoice'

Errors:
  - item_not_found: the specified folder item ID does not exist`,
      inputSchema: z.object({
        drive_id: z.string().describe("The drive ID"),
        item_id: z.string().describe("Folder item ID to scope the search to"),
        query: z.string().min(1).describe("Search keyword(s)"),
        limit: z.number().int().min(1).max(200).default(50).describe("Max results to return (default: 50)"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) => toResponse(await searchWithinFolder(args))
  );

  // ── airtho_get_file_metadata ────────────────────────────────────────────────
  server.registerTool(
    "airtho_get_file_metadata",
    {
      title: "Get File Metadata",
      description: `Get metadata for a specific file: name, size, dates, MIME type, and a pre-authenticated download URL.

Args:
  - drive_id (string): The drive ID
  - item_id (string): The file's Graph item ID

Returns:
  { name, id, size, modified, created, download_url, mime_type }

Examples:
  - Use when: confirming file details before reading content, or retrieving a download URL
  - download_url is a short-lived pre-authenticated URL valid for ~1 hour

Errors:
  - item_not_found: no item with this ID found in this drive`,
      inputSchema: z.object({
        drive_id: z.string().describe("The drive ID"),
        item_id: z.string().describe("The file's Graph item ID"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => toResponse(await getFileMetadata(args))
  );

  // ── airtho_read_file_content ────────────────────────────────────────────────
  server.registerTool(
    "airtho_read_file_content",
    {
      title: "Read File Content",
      description: `Fetch the text content of a file. Supported formats: plain text, CSV, JSON, XML, HTML, Markdown, JavaScript, and Word (.docx via Graph text conversion). Content is truncated at ~50,000 characters with truncated=true flag.

Args:
  - drive_id (string): The drive ID
  - item_id (string): The file's Graph item ID

Returns:
  { content (string), mime_type, truncated (boolean) }

Examples:
  - Use when: reading a quote, spec, or report file to extract information
  - For .docx: Graph API converts to plain text automatically
  - If truncated=true: use airtho_get_file_metadata to get the download_url for the full file

Errors:
  - content_unavailable: file type not supported for text extraction (e.g. .dwg, .pdf, .xlsx)
  - item_not_found: no item with this ID found in this drive`,
      inputSchema: z.object({
        drive_id: z.string().describe("The drive ID"),
        item_id: z.string().describe("The file's Graph item ID"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => toResponse(await readFileContent(args))
  );
}
