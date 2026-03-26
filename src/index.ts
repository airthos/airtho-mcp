/**
 * Airtho MCP Server — Azure Functions v4 with native MCP tool triggers
 *
 * High-level tools for navigating Airtho's SharePoint document libraries.
 * All tools accept human-readable names and paths — no opaque IDs required.
 * Server-side fuzzy matching and aggregation keeps model context lean.
 *
 * Tools: airtho_search_jobs, airtho_get_job, airtho_find_in_job,
 *        airtho_read_job_file, airtho_get_recent_jobs, airtho_list_vendors,
 *        airtho_browse, airtho_search, airtho_read
 *
 * Local dev:  func start  →  http://localhost:7071/runtime/webhooks/mcp
 * Deployed:   https://<app>.azurewebsites.net/runtime/webhooks/mcp
 */

import { app, InvocationContext, arg } from "@azure/functions";
import "./favicon.js";
import { browse } from "./tools/browse.js";
import { search } from "./tools/search.js";
import { read } from "./tools/read.js";
import { searchJobs } from "./tools/search-jobs.js";
import { getJob } from "./tools/get-job.js";
import { findInJob } from "./tools/find-in-job.js";
import { readJobFile } from "./tools/read-job-file.js";
import { getRecentJobs } from "./tools/get-recent-jobs.js";
import { listVendors } from "./tools/list-vendors.js";
import { listLists } from "./tools/list-lists.js";
import { getListItems } from "./tools/get-list-items.js";
import { searchList } from "./tools/search-list.js";
import { getListItem } from "./tools/get-list-item.js";

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

/** Safely coerce MCP args (which arrive as strings) to number. */
function numArg(val: unknown): number | undefined {
  if (val === undefined || val === null) return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

function toResult(result: unknown): string {
  return JSON.stringify(result, null, 2);
}

// ── airtho_search_jobs ────────────────────────────────────────────────────────
app.mcpTool("airthoSearchJobs", {
  toolName: "airtho_search_jobs",
  description:
    "Find jobs by keyword (fuzzy match). Omit keyword to list all. " +
    "Prefer airtho_get_job for single job lookups — it returns structure in one call.",
  toolProperties: {
    keyword: arg.string().describe("Keyword to fuzzy-match against job names, e.g. 'factorial' or 'billerica'. Omit to list all jobs.").optional(),
    limit: arg.number().describe("Max jobs to return, 1-200 (default: 50)").optional(),
  },
  handler: async (_toolArgs: unknown, context: InvocationContext): Promise<string> => {
    const args = getArgs(context);
    const result = await searchJobs({
      keyword: args.keyword as string | undefined,
      limit: numArg(args.limit),
    });
    return toResult(result);
  },
});

// ── airtho_get_job ────────────────────────────────────────────────────────────
app.mcpTool("airthoGetJob", {
  toolName: "airtho_get_job",
  description:
    "Resolve a job by keyword and return its folder/file structure in one call. " +
    "Preferred entry point for single job lookups — replaces search_jobs + browse.",
  toolProperties: {
    keyword: arg.string().describe("Job name or number to look up, e.g. 'factorial' or '1001'"),
  },
  handler: async (_toolArgs: unknown, context: InvocationContext): Promise<string> => {
    const args = getArgs(context);
    const result = await getJob({ keyword: args.keyword as string });
    return toResult(result);
  },
});

// ── airtho_find_in_job ────────────────────────────────────────────────────────
app.mcpTool("airthoFindInJob", {
  toolName: "airtho_find_in_job",
  description:
    "Search for files within a job by keyword. Resolves job and scopes search in one call. " +
    "Use airtho_read_job_file to read a matched file.",
  toolProperties: {
    job_keyword: arg.string().describe("Job name or number, e.g. 'factorial' or '1000'"),
    file_keyword: arg.string().describe("Filename or content keyword to search for, e.g. 'meeting notes' or 'BOM'"),
    limit: arg.number().describe("Max results to return (default: 20)").optional(),
  },
  handler: async (_toolArgs: unknown, context: InvocationContext): Promise<string> => {
    const args = getArgs(context);
    const result = await findInJob({
      job_keyword: args.job_keyword as string,
      file_keyword: args.file_keyword as string,
      limit: numArg(args.limit),
    });
    return toResult(result);
  },
});

// ── airtho_read_job_file ──────────────────────────────────────────────────────
app.mcpTool("airthoReadJobFile", {
  toolName: "airtho_read_job_file",
  description:
    "Find and read a file from a job in one call. Resolves job + file by keyword — no IDs needed. " +
    "Supports text, CSV, JSON, Word (.docx). Returns download URL for PDFs and Excel.",
  toolProperties: {
    job_keyword: arg.string().describe("Job name or number, e.g. 'factorial' or '1002'"),
    file_keyword: arg.string().describe("Filename or content keyword, e.g. 'RFP' or 'meeting redesign'"),
  },
  handler: async (_toolArgs: unknown, context: InvocationContext): Promise<string> => {
    const args = getArgs(context);
    const result = await readJobFile({
      job_keyword: args.job_keyword as string,
      file_keyword: args.file_keyword as string,
    });
    return toResult(result);
  },
});

// ── airtho_get_recent_jobs ────────────────────────────────────────────────────
app.mcpTool("airthoGetRecentJobs", {
  toolName: "airtho_get_recent_jobs",
  description:
    "Most recently modified jobs, sorted newest first. No keyword needed.",
  toolProperties: {
    limit: arg.number().describe("Number of recent jobs to return (default: 10)").optional(),
  },
  handler: async (_toolArgs: unknown, context: InvocationContext): Promise<string> => {
    const args = getArgs(context);
    const result = await getRecentJobs({ limit: numArg(args.limit) });
    return toResult(result);
  },
});

// ── airtho_list_vendors ───────────────────────────────────────────────────────
app.mcpTool("airthoListVendors", {
  toolName: "airtho_list_vendors",
  description:
    "Find vendors by keyword (fuzzy match). Omit keyword to list all. " +
    "Use folder_path with airtho_browse to explore a vendor's files.",
  toolProperties: {
    keyword: arg.string().describe("Vendor name keyword, e.g. 'siemens' or 'cleanroom'. Omit to list all vendors.").optional(),
    limit: arg.number().describe("Max vendors to return (default: 50)").optional(),
  },
  handler: async (_toolArgs: unknown, context: InvocationContext): Promise<string> => {
    const args = getArgs(context);
    const result = await listVendors({
      keyword: args.keyword as string | undefined,
      limit: numArg(args.limit),
    });
    return toResult(result);
  },
});

// ── airtho_list_lists ─────────────────────────────────────────────────────────
app.mcpTool("airthoListLists", {
  toolName: "airtho_list_lists",
  description:
    "Discover available SharePoint lists with column names, types, and choice values. " +
    "Call first to learn list names and field_names before querying with get_list_items.",
  toolProperties: {
    site_name: arg.string().describe("Site name if using multiple sites (e.g. 'airtho'). Omit to use the default site.").optional(),
  },
  handler: async (_toolArgs: unknown, context: InvocationContext): Promise<string> => {
    const args = getArgs(context);
    const result = await listLists({
      site_name: args.site_name as string | undefined,
    });
    return toResult(result);
  },
});

// ── airtho_get_list_items ─────────────────────────────────────────────────────
app.mcpTool("airthoGetListItems", {
  toolName: "airtho_get_list_items",
  description:
    "Fetch rows from a SharePoint list. Pass field_names (from list_lists) in columns param. " +
    "Filter with filter_field + filter_value. Returns sp_id per item for drill-down via get_list_item.",
  toolProperties: {
    list_name: arg.string().describe("List display name or internal name, e.g. 'RFI Log'"),
    columns: arg.string().describe("Comma-separated field_names to return, e.g. 'Title,Status,DueDate'. Omit for all non-system columns.").optional(),
    filter_field: arg.string().describe("Column field_name to filter on, e.g. 'Status'").optional(),
    filter_value: arg.string().describe("Value to match (eq), e.g. 'Open'").optional(),
    limit: arg.number().describe("Max rows to return, 1-200 (default: 50)").optional(),
    site_name: arg.string().describe("Site name if using multiple sites. Omit for default site.").optional(),
  },
  handler: async (_toolArgs: unknown, context: InvocationContext): Promise<string> => {
    const args = getArgs(context);
    const columns = args.columns
      ? (args.columns as string).split(",").map((c) => c.trim()).filter(Boolean)
      : undefined;
    const result = await getListItems({
      list_name: args.list_name as string,
      columns,
      filter_field: args.filter_field as string | undefined,
      filter_value: args.filter_value as string | undefined,
      limit: numArg(args.limit),
      site_name: args.site_name as string | undefined,
    });
    return toResult(result);
  },
});

// ── airtho_search_list ────────────────────────────────────────────────────────
app.mcpTool("airthoSearchList", {
  toolName: "airtho_search_list",
  description:
    "Keyword search across all text fields in a SharePoint list. " +
    "Returns sp_id, title, and matched fields only. Searches first 200 items — check has_more.",
  toolProperties: {
    list_name: arg.string().describe("List display name or internal name, e.g. 'RFI Log'"),
    keyword: arg.string().describe("Keyword to search for across all text field values"),
    limit: arg.number().describe("Max matching items to return (default: 20)").optional(),
    site_name: arg.string().describe("Site name if using multiple sites. Omit for default site.").optional(),
  },
  handler: async (_toolArgs: unknown, context: InvocationContext): Promise<string> => {
    const args = getArgs(context);
    const result = await searchList({
      list_name: args.list_name as string,
      keyword: args.keyword as string,
      limit: numArg(args.limit),
      site_name: args.site_name as string | undefined,
    });
    return toResult(result);
  },
});

// ── airtho_get_list_item ──────────────────────────────────────────────────────
app.mcpTool("airthoGetListItem", {
  toolName: "airtho_get_list_item",
  description:
    "Fetch a single list item by sp_id (from get_list_items or search_list). " +
    "Optionally limit fields with columns param.",
  toolProperties: {
    list_name: arg.string().describe("List display name or internal name, e.g. 'RFI Log'"),
    item_id: arg.number().describe("The sp_id of the item to fetch (integer)"),
    columns: arg.string().describe("Comma-separated field_names to return. Omit for all non-system columns.").optional(),
    site_name: arg.string().describe("Site name if using multiple sites. Omit for default site.").optional(),
  },
  handler: async (_toolArgs: unknown, context: InvocationContext): Promise<string> => {
    const args = getArgs(context);
    const columns = args.columns
      ? (args.columns as string).split(",").map((c) => c.trim()).filter(Boolean)
      : undefined;
    const result = await getListItem({
      list_name: args.list_name as string,
      item_id: numArg(args.item_id) ?? 0,
      columns,
      site_name: args.site_name as string | undefined,
    });
    return toResult(result);
  },
});

// ── airtho_browse ─────────────────────────────────────────────────────────────
app.mcpTool("airthoBrowse", {
  toolName: "airtho_browse",
  description:
    "Browse document libraries by path. No args → list drives. drive_name + path → list folder contents. " +
    "Prefer job-specific tools for job navigation; use this for non-job drives or deep browsing.",
  toolProperties: {
    drive_name: arg.string().describe("Drive name, e.g. 'Jobs', 'Quotes', 'Vendors'. Omit to list all available drives.").optional(),
    path: arg.string().describe("Path within the drive, e.g. '051 Factorial/Submittals'. Omit to list drive root. Prefer path over item_id.").optional(),
    item_id: arg.string().describe("Internal item ID — only use if you have no path available.").optional(),
    limit: arg.number().describe("Max items to return, 1-200 (default: 50)").optional(),
    offset: arg.number().describe("Items to skip for pagination (default: 0)").optional(),
  },
  handler: async (_toolArgs: unknown, context: InvocationContext): Promise<string> => {
    const args = getArgs(context);
    const result = await browse({
      drive_name: args.drive_name as string | undefined,
      path: args.path as string | undefined,
      item_id: args.item_id as string | undefined,
      limit: numArg(args.limit),
      offset: numArg(args.offset),
    });
    return toResult(result);
  },
});

// ── airtho_search ─────────────────────────────────────────────────────────────
app.mcpTool("airthoSearch", {
  toolName: "airtho_search",
  description:
    "Full-text search across file names and content in a drive (default: Jobs). " +
    "For job-scoped searches, prefer airtho_find_in_job.",
  toolProperties: {
    query: arg.string().describe("Search keywords, e.g. 'temperature review' or 'change order'"),
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
      limit: numArg(args.limit),
    });
    return toResult(result);
  },
});

// ── airtho_read ───────────────────────────────────────────────────────────────
app.mcpTool("airthoRead", {
  toolName: "airtho_read",
  description:
    "Read file content by drive + path. Supports text, CSV, JSON, XML, HTML, Markdown, Word (.docx). " +
    "Returns download URL for PDFs/Excel/images. For job files, prefer airtho_read_job_file.",
  toolProperties: {
    drive_name: arg.string().describe("Drive name, e.g. 'Jobs', 'Quotes'"),
    path: arg.string().describe("File path within the drive, e.g. '051 Factorial/Factorial_Meeting.docx'. Prefer path over item_id.").optional(),
    item_id: arg.string().describe("Internal item ID — only use if you have no path available.").optional(),
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
