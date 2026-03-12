/**
 * Airtho MCP Server — Azure Functions v4 with native MCP tool triggers
 *
 * Each tool is registered via app.mcpTool() and exposed at:
 *   /runtime/webhooks/mcp  (Streamable HTTP)
 *
 * Local dev:  func start  →  http://localhost:7071/runtime/webhooks/mcp
 * Deployed:   https://<app>.azurewebsites.net/runtime/webhooks/mcp
 */

import { app, InvocationContext, arg } from "@azure/functions";
import { listDrives } from "./tools/list-drives.js";
import { listDriveChildren } from "./tools/list-drive-children.js";
import { getItemByPath } from "./tools/get-item-by-path.js";
import { searchWithinFolder } from "./tools/search-within-folder.js";
import { getFileMetadata } from "./tools/get-file-metadata.js";
import { readFileContent } from "./tools/read-file-content.js";

// ── Env validation ────────────────────────────────────────────────────────────
const REQUIRED_ENV = ["TENANT_ID", "CLIENT_ID", "CLIENT_SECRET"] as const;
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

// ── Helper to extract tool args and JSON-stringify the result ─────────────────
function getArgs(context: InvocationContext): Record<string, unknown> {
  return (context.triggerMetadata?.mcptoolargs as Record<string, unknown>) ?? {};
}

function toResult(result: unknown): string {
  return JSON.stringify(result, null, 2);
}

// ── airtho_list_drives ──────────────────────────────────────────────────────
app.mcpTool("airthoListDrives", {
  toolName: "airtho_list_drives",
  description: "List available document library drives on an Airtho SharePoint site. Use once to discover drive IDs for subsequent calls.",
  toolProperties: {
    site_id: arg.string().describe("SharePoint site ID. Omit to use the server default.").optional(),
  },
  handler: async (_toolArgs: unknown, context: InvocationContext): Promise<string> => {
    const args = getArgs(context);
    const result = await listDrives({ site_id: args.site_id as string | undefined });
    return toResult(result);
  },
});

// ── airtho_list_drive_children ──────────────────────────────────────────────
app.mcpTool("airthoListDriveChildren", {
  toolName: "airtho_list_drive_children",
  description: "List the immediate children (files and folders) of a folder in a SharePoint drive.",
  toolProperties: {
    drive_id: arg.string().describe("The drive ID"),
    item_id: arg.string().describe("Folder item ID, or 'root' for the drive root"),
    limit: arg.number().describe("Max items to return, 1-200 (default: 50)").optional(),
    offset: arg.number().describe("Items to skip for pagination (default: 0)").optional(),
  },
  handler: async (_toolArgs: unknown, context: InvocationContext): Promise<string> => {
    const args = getArgs(context);
    const result = await listDriveChildren({
      drive_id: args.drive_id as string,
      item_id: args.item_id as string,
      limit: args.limit as number | undefined,
      offset: args.offset as number | undefined,
    });
    return toResult(result);
  },
});

// ── airtho_get_item_by_path ─────────────────────────────────────────────────
app.mcpTool("airthoGetItemByPath", {
  toolName: "airtho_get_item_by_path",
  description: "Resolve a path string to a Graph item ID and metadata. Use to navigate to known folder paths without iterating children.",
  toolProperties: {
    drive_id: arg.string().describe("The drive ID"),
    path: arg.string().describe("Path relative to drive root, e.g. 'Jobs/2024-001 Acme Corp'"),
  },
  handler: async (_toolArgs: unknown, context: InvocationContext): Promise<string> => {
    const args = getArgs(context);
    const result = await getItemByPath({
      drive_id: args.drive_id as string,
      path: args.path as string,
    });
    return toResult(result);
  },
});

// ── airtho_search_within_folder ─────────────────────────────────────────────
app.mcpTool("airthoSearchWithinFolder", {
  toolName: "airtho_search_within_folder",
  description: "Search for files by keyword within a specific folder subtree. Scoped to the provided folder — not tenant-wide.",
  toolProperties: {
    drive_id: arg.string().describe("The drive ID"),
    item_id: arg.string().describe("Folder item ID to scope the search to"),
    query: arg.string().describe("Search keyword(s)"),
    limit: arg.number().describe("Max results to return, 1-200 (default: 50)").optional(),
  },
  handler: async (_toolArgs: unknown, context: InvocationContext): Promise<string> => {
    const args = getArgs(context);
    const result = await searchWithinFolder({
      drive_id: args.drive_id as string,
      item_id: args.item_id as string,
      query: args.query as string,
      limit: args.limit as number | undefined,
    });
    return toResult(result);
  },
});

// ── airtho_get_file_metadata ────────────────────────────────────────────────
app.mcpTool("airthoGetFileMetadata", {
  toolName: "airtho_get_file_metadata",
  description: "Get metadata for a specific file: name, size, dates, MIME type, and a pre-authenticated download URL.",
  toolProperties: {
    drive_id: arg.string().describe("The drive ID"),
    item_id: arg.string().describe("The file's Graph item ID"),
  },
  handler: async (_toolArgs: unknown, context: InvocationContext): Promise<string> => {
    const args = getArgs(context);
    const result = await getFileMetadata({
      drive_id: args.drive_id as string,
      item_id: args.item_id as string,
    });
    return toResult(result);
  },
});

// ── airtho_read_file_content ────────────────────────────────────────────────
app.mcpTool("airthoReadFileContent", {
  toolName: "airtho_read_file_content",
  description: "Fetch the text content of a file. Supported: plain text, CSV, JSON, XML, HTML, Markdown, JS, Word (.docx). Truncated at ~50,000 chars.",
  toolProperties: {
    drive_id: arg.string().describe("The drive ID"),
    item_id: arg.string().describe("The file's Graph item ID"),
  },
  handler: async (_toolArgs: unknown, context: InvocationContext): Promise<string> => {
    const args = getArgs(context);
    const result = await readFileContent({
      drive_id: args.drive_id as string,
      item_id: args.item_id as string,
    });
    return toResult(result);
  },
});
