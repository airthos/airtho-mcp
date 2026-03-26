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

function toResult(result: unknown): string {
  return JSON.stringify(result, null, 2);
}

// ── airtho_search_jobs ────────────────────────────────────────────────────────
app.mcpTool("airthoSearchJobs", {
  toolName: "airtho_search_jobs",
  description:
    "Find Airtho jobs by keyword. Fuzzy-matches against job folder names server-side and returns a compact list. " +
    "Omit keyword to list all jobs. Use folder_path with airtho_get_job to get full details. " +
    "Prefer airtho_get_job if you only need one job — it returns structure in the same call.",
  toolProperties: {
    keyword: arg.string().describe("Keyword to fuzzy-match against job names, e.g. 'factorial' or 'billerica'. Omit to list all jobs.").optional(),
    limit: arg.number().describe("Max jobs to return, 1-200 (default: 50)").optional(),
  },
  handler: async (_toolArgs: unknown, context: InvocationContext): Promise<string> => {
    const args = getArgs(context);
    const result = await searchJobs({
      keyword: args.keyword as string | undefined,
      limit: args.limit as number | undefined,
    });
    return toResult(result);
  },
});

// ── airtho_get_job ────────────────────────────────────────────────────────────
app.mcpTool("airthoGetJob", {
  toolName: "airtho_get_job",
  description:
    "Resolve a job by keyword and return its metadata plus top-level folder/file structure in one call. " +
    "Use this instead of search_jobs + browse — it does both server-side. " +
    "Returns subfolders (Engineering, Finance & admin, Submittals, etc.) and root files.",
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
    "Search for files within a specific job by keyword. Resolves the job and scopes the search server-side. " +
    "Use this instead of search_jobs + airtho_search — it does both in one call. " +
    "Returns matching file names and paths. Use airtho_read_job_file to read a result.",
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
      limit: args.limit as number | undefined,
    });
    return toResult(result);
  },
});

// ── airtho_read_job_file ──────────────────────────────────────────────────────
app.mcpTool("airthoReadJobFile", {
  toolName: "airtho_read_job_file",
  description:
    "Find and read a file from a job in one call. Resolves job and file server-side — no IDs needed at any step. " +
    "Use this instead of search_jobs + find_in_job + airtho_read. " +
    "Supports plain text, CSV, JSON, Word (.docx). Returns download URL for PDFs and Excel.",
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
    "Return the most recently modified jobs, sorted newest first. " +
    "Useful for 'what have we been working on lately?' — no keyword needed.",
  toolProperties: {
    limit: arg.number().describe("Number of recent jobs to return (default: 10)").optional(),
  },
  handler: async (_toolArgs: unknown, context: InvocationContext): Promise<string> => {
    const args = getArgs(context);
    const result = await getRecentJobs({ limit: args.limit as number | undefined });
    return toResult(result);
  },
});

// ── airtho_list_vendors ───────────────────────────────────────────────────────
app.mcpTool("airthoListVendors", {
  toolName: "airtho_list_vendors",
  description:
    "Find vendors in Airtho's Vendors drive by keyword. Server-side fuzzy match on vendor folder names. " +
    "Omit keyword to list all vendors. Use folder_path with airtho_browse to explore a vendor's files.",
  toolProperties: {
    keyword: arg.string().describe("Vendor name keyword, e.g. 'siemens' or 'cleanroom'. Omit to list all vendors.").optional(),
    limit: arg.number().describe("Max vendors to return (default: 50)").optional(),
  },
  handler: async (_toolArgs: unknown, context: InvocationContext): Promise<string> => {
    const args = getArgs(context);
    const result = await listVendors({
      keyword: args.keyword as string | undefined,
      limit: args.limit as number | undefined,
    });
    return toResult(result);
  },
});

// ── airtho_list_lists ─────────────────────────────────────────────────────────
app.mcpTool("airthoListLists", {
  toolName: "airtho_list_lists",
  description:
    "List all SharePoint lists on the Airtho site with their column names and types. " +
    "Returns list names, column names, column types, and choice values in one call — " +
    "use this first to discover what lists exist and what fields to query before calling get_list_items. " +
    "Document libraries are excluded (covered by the job and browse tools).",
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
    "Fetch rows from a named SharePoint list. Use airtho_list_lists first to discover list names and column field_names. " +
    "Pass field_names (not display names) in the columns param. " +
    "Use filter_field + filter_value to narrow results to a single column value. " +
    "Returns sp_id on each item — pass it to airtho_get_list_item for full details.",
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
      limit: args.limit as number | undefined,
      site_name: args.site_name as string | undefined,
    });
    return toResult(result);
  },
});

// ── airtho_search_list ────────────────────────────────────────────────────────
app.mcpTool("airthoSearchList", {
  toolName: "airtho_search_list",
  description:
    "Search for a keyword across all text fields in a SharePoint list. " +
    "Returns each matching item's sp_id, title, and only the fields that contained the keyword. " +
    "Use airtho_get_list_item to fetch full details for a match. " +
    "Note: searches the first 200 items only — see has_more if the list may have more.",
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
      limit: args.limit as number | undefined,
      site_name: args.site_name as string | undefined,
    });
    return toResult(result);
  },
});

// ── airtho_get_list_item ──────────────────────────────────────────────────────
app.mcpTool("airthoGetListItem", {
  toolName: "airtho_get_list_item",
  description:
    "Fetch a single SharePoint list item by its sp_id. " +
    "Use sp_id values returned by airtho_get_list_items or airtho_search_list. " +
    "Optionally specify columns (field_names) to limit the fields returned.",
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
      item_id: args.item_id as number,
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
    "Browse Airtho's SharePoint document libraries by path. " +
    "Call with no arguments to list available drives. " +
    "Call with drive_name + path to list a subfolder (e.g. path='051 Factorial/Engineering'). " +
    "Prefer the job-specific tools (airtho_get_job, airtho_find_in_job) for job navigation — use this for non-job drives or deep subfolder browsing.",
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
    "Full-text search across file names and content in any Airtho drive. Defaults to Jobs drive. " +
    "For job-scoped searches, prefer airtho_find_in_job — it resolves the job by keyword for you. " +
    "Use this for cross-job or non-job drive searches.",
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
      limit: args.limit as number | undefined,
    });
    return toResult(result);
  },
});

// ── airtho_read ───────────────────────────────────────────────────────────────
app.mcpTool("airthoRead", {
  toolName: "airtho_read",
  description:
    "Read the text content of a file from Airtho's SharePoint by path. " +
    "Supports: plain text, CSV, JSON, XML, HTML, Markdown, JS/TS, Word (.docx). " +
    "For unsupported formats (PDF, Excel, images), returns a download URL to share with the user. " +
    "For job files, prefer airtho_read_job_file — it resolves job and file by keyword without needing a full path.",
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
