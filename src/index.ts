/**
 * Airtho MCP Server — Azure Functions v4 with native MCP tool triggers
 *
 * Three high-level tools for navigating Airtho's SharePoint document libraries.
 * All tools accept human-readable drive names (e.g., "Jobs") — no opaque IDs required.
 *
 * Tools: airtho_browse, airtho_search, airtho_read
 *
 * Local dev:  func start  →  http://localhost:7071/runtime/webhooks/mcp
 * Deployed:   https://<app>.azurewebsites.net/runtime/webhooks/mcp
 */

import { app, InvocationContext, arg } from "@azure/functions";
import { browse } from "./tools/browse.js";
import { search } from "./tools/search.js";
import { read } from "./tools/read.js";

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

// ── airtho_browse ─────────────────────────────────────────────────────────────
app.mcpTool("airthoBrowse", {
  toolName: "airtho_browse",
  description:
    "Browse Airtho's SharePoint document libraries. " +
    "Call with no arguments to list available drives. " +
    "Call with drive_name to list its root contents. " +
    "Call with drive_name + path to list a subfolder or get file metadata. " +
    "Returns folder contents (name, item_id, type, size) or file metadata with download URL.",
  toolProperties: {
    drive_name: arg.string().describe("Drive name, e.g. 'Jobs', 'Quotes', 'Vendors'. Omit to list all available drives.").optional(),
    path: arg.string().describe("Path within the drive, e.g. '051 Factorial' or '051 Factorial/Submittals'. Omit to list drive root.").optional(),
    item_id: arg.string().describe("Item ID from a previous browse/search result. Use instead of path for follow-up navigation.").optional(),
    limit: arg.number().describe("Max items to return, 1-200 (default: 50)").optional(),
    offset: arg.number().describe("Items to skip for pagination (default: 0)").optional(),
  },
  handler: async (_toolArgs: unknown, context: InvocationContext): Promise<string> => {
    const args = getArgs(context);
    const result = await browse({
      drive_name: args.drive_name as string | undefined,
      path: args.path as string | undefined,
      item_id: args.item_id as string | undefined,
      limit: args.limit as number | undefined,
      offset: args.offset as number | undefined,
    });
    return toResult(result);
  },
});

// ── airtho_search ─────────────────────────────────────────────────────────────
app.mcpTool("airthoSearch", {
  toolName: "airtho_search",
  description:
    "Search for files by keyword within Airtho's SharePoint. " +
    "Searches file names and content. Defaults to the Jobs drive. " +
    "Optionally scope to a specific folder path. " +
    "Returns matching files with item_id, path, size, and modified date.",
  toolProperties: {
    query: arg.string().describe("Search keywords, e.g. 'Factorial' or 'temperature review'"),
    drive_name: arg.string().describe("Drive to search in (default: 'Jobs')").optional(),
    folder_path: arg.string().describe("Scope search to a subfolder path, e.g. '051 Factorial'. Omit to search entire drive.").optional(),
    limit: arg.number().describe("Max results to return, 1-200 (default: 50)").optional(),
  },
  handler: async (_toolArgs: unknown, context: InvocationContext): Promise<string> => {
    const args = getArgs(context);
    const result = await search({
      query: args.query as string,
      drive_name: args.drive_name as string | undefined,
      folder_path: args.folder_path as string | undefined,
      limit: args.limit as number | undefined,
    });
    return toResult(result);
  },
});

// ── airtho_read ───────────────────────────────────────────────────────────────
app.mcpTool("airthoRead", {
  toolName: "airtho_read",
  description:
    "Read the text content of a file from Airtho's SharePoint. " +
    "Supports: plain text, CSV, JSON, XML, HTML, Markdown, JS/TS, Word (.docx). " +
    "For unsupported formats (PDF, Excel, images), returns a download URL to share with the user. " +
    "Provide either a file path or an item_id from a previous browse/search result.",
  toolProperties: {
    drive_name: arg.string().describe("Drive name, e.g. 'Jobs', 'Quotes'"),
    path: arg.string().describe("File path within the drive, e.g. '051 Factorial/some-doc.docx'").optional(),
    item_id: arg.string().describe("File item_id from a previous browse/search result. Use instead of path.").optional(),
  },
  handler: async (_toolArgs: unknown, context: InvocationContext): Promise<string> => {
    const args = getArgs(context);
    const result = await read({
      drive_name: args.drive_name as string,
      path: args.path as string | undefined,
      item_id: args.item_id as string | undefined,
    });
    return toResult(result);
  },
});
