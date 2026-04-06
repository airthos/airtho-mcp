/**
 * MCP Server — tool registration for Airtho SharePoint connector.
 *
 * All 13 tools are registered here with Zod input schemas. Tool handlers
 * read the per-request user token from AsyncLocalStorage (token-store.ts)
 * and pass it through to the Graph client for per-user SharePoint access.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getUserToken } from "./auth/token-store.js";

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

function toResult(result: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "airtho-mcp-server",
    version: "1.0.0",
  });

  // ── airtho_search_jobs ──────────────────────────────────────────────────

  server.tool(
    "airtho_search_jobs",
    "Find jobs by keyword (fuzzy match). Omit keyword to list all. " +
      "Prefer airtho_get_job for single job lookups — it returns structure in one call.",
    {
      keyword: z.string().describe("Keyword to fuzzy-match against job names, e.g. 'factorial' or 'billerica'. Omit to list all jobs.").optional(),
      limit: z.number().describe("Max jobs to return, 1-200 (default: 50)").optional(),
    },
    async ({ keyword, limit }) => {
      const result = await searchJobs({ keyword, limit, userToken: getUserToken() });
      return toResult(result);
    },
  );

  // ── airtho_get_job ──────────────────────────────────────────────────────

  server.tool(
    "airtho_get_job",
    "Resolve a job by keyword and return its folder/file structure in one call. " +
      "Preferred entry point for single job lookups — replaces search_jobs + browse.",
    {
      keyword: z.string().describe("Job name or number to look up, e.g. 'factorial' or '1001'"),
    },
    async ({ keyword }) => {
      const result = await getJob({ keyword, userToken: getUserToken() });
      return toResult(result);
    },
  );

  // ── airtho_find_in_job ──────────────────────────────────────────────────

  server.tool(
    "airtho_find_in_job",
    "Search for files within a job by keyword. Resolves job and scopes search in one call. " +
      "Use airtho_read_job_file to read a matched file.",
    {
      job_keyword: z.string().describe("Job name or number, e.g. 'factorial' or '1000'"),
      file_keyword: z.string().describe("Filename or content keyword to search for, e.g. 'meeting notes' or 'BOM'"),
      limit: z.number().describe("Max results to return (default: 20)").optional(),
    },
    async ({ job_keyword, file_keyword, limit }) => {
      const result = await findInJob({ job_keyword, file_keyword, limit, userToken: getUserToken() });
      return toResult(result);
    },
  );

  // ── airtho_read_job_file ────────────────────────────────────────────────

  server.tool(
    "airtho_read_job_file",
    "Find and read a file from a job in one call. Resolves job + file by keyword — no IDs needed. " +
      "Supports text, CSV, JSON, Word (.docx). Returns download URL for PDFs and Excel.",
    {
      job_keyword: z.string().describe("Job name or number, e.g. 'factorial' or '1002'"),
      file_keyword: z.string().describe("Filename or content keyword, e.g. 'RFP' or 'meeting redesign'"),
    },
    async ({ job_keyword, file_keyword }) => {
      const result = await readJobFile({ job_keyword, file_keyword, userToken: getUserToken() });
      return toResult(result);
    },
  );

  // ── airtho_get_recent_jobs ──────────────────────────────────────────────

  server.tool(
    "airtho_get_recent_jobs",
    "Most recently modified jobs, sorted newest first. No keyword needed.",
    {
      limit: z.number().describe("Number of recent jobs to return (default: 10)").optional(),
    },
    async ({ limit }) => {
      const result = await getRecentJobs({ limit, userToken: getUserToken() });
      return toResult(result);
    },
  );

  // ── airtho_list_vendors ─────────────────────────────────────────────────

  server.tool(
    "airtho_list_vendors",
    "Find vendors by keyword (fuzzy match). Omit keyword to list all. " +
      "Use folder_path with airtho_browse to explore a vendor's files.",
    {
      keyword: z.string().describe("Vendor name keyword, e.g. 'siemens' or 'cleanroom'. Omit to list all vendors.").optional(),
      limit: z.number().describe("Max vendors to return (default: 50)").optional(),
    },
    async ({ keyword, limit }) => {
      const result = await listVendors({ keyword, limit, userToken: getUserToken() });
      return toResult(result);
    },
  );

  // ── airtho_list_lists ───────────────────────────────────────────────────

  server.tool(
    "airtho_list_lists",
    "Discover available SharePoint lists with column names, types, and choice values. " +
      "Call first to learn list names and field_names before querying with get_list_items.",
    {
      site_name: z.string().describe("Site name if using multiple sites (e.g. 'airtho'). Omit to use the default site.").optional(),
    },
    async ({ site_name }) => {
      const result = await listLists({ site_name, userToken: getUserToken() });
      return toResult(result);
    },
  );

  // ── airtho_get_list_items ───────────────────────────────────────────────

  server.tool(
    "airtho_get_list_items",
    "Fetch rows from a SharePoint list. Pass field_names (from list_lists) in columns param. " +
      "Filter with filter_field + filter_value. Returns sp_id per item for drill-down via get_list_item.",
    {
      list_name: z.string().describe("List display name or internal name, e.g. 'RFI Log'"),
      columns: z.string().describe("Comma-separated field_names to return, e.g. 'Title,Status,DueDate'. Omit for all non-system columns.").optional(),
      filter_field: z.string().describe("Column field_name to filter on, e.g. 'Status'").optional(),
      filter_value: z.string().describe("Value to match (eq), e.g. 'Open'").optional(),
      limit: z.number().describe("Max rows to return, 1-200 (default: 50)").optional(),
      site_name: z.string().describe("Site name if using multiple sites. Omit for default site.").optional(),
    },
    async ({ list_name, columns, filter_field, filter_value, limit, site_name }) => {
      const parsedColumns = columns
        ? columns.split(",").map((c) => c.trim()).filter(Boolean)
        : undefined;
      const result = await getListItems({
        list_name,
        columns: parsedColumns,
        filter_field,
        filter_value,
        limit,
        site_name,
        userToken: getUserToken(),
      });
      return toResult(result);
    },
  );

  // ── airtho_search_list ──────────────────────────────────────────────────

  server.tool(
    "airtho_search_list",
    "Keyword search across all text fields in a SharePoint list. " +
      "Returns sp_id, title, and matched fields only. Searches first 200 items — check has_more.",
    {
      list_name: z.string().describe("List display name or internal name, e.g. 'RFI Log'"),
      keyword: z.string().describe("Keyword to search for across all text field values"),
      limit: z.number().describe("Max matching items to return (default: 20)").optional(),
      site_name: z.string().describe("Site name if using multiple sites. Omit for default site.").optional(),
    },
    async ({ list_name, keyword, limit, site_name }) => {
      const result = await searchList({ list_name, keyword, limit, site_name, userToken: getUserToken() });
      return toResult(result);
    },
  );

  // ── airtho_get_list_item ────────────────────────────────────────────────

  server.tool(
    "airtho_get_list_item",
    "Fetch a single list item by sp_id (from get_list_items or search_list). " +
      "Optionally limit fields with columns param.",
    {
      list_name: z.string().describe("List display name or internal name, e.g. 'RFI Log'"),
      item_id: z.number().describe("The sp_id of the item to fetch (integer)"),
      columns: z.string().describe("Comma-separated field_names to return. Omit for all non-system columns.").optional(),
      site_name: z.string().describe("Site name if using multiple sites. Omit for default site.").optional(),
    },
    async ({ list_name, item_id, columns, site_name }) => {
      const parsedColumns = columns
        ? columns.split(",").map((c) => c.trim()).filter(Boolean)
        : undefined;
      const result = await getListItem({
        list_name,
        item_id,
        columns: parsedColumns,
        site_name,
        userToken: getUserToken(),
      });
      return toResult(result);
    },
  );

  // ── airtho_browse ───────────────────────────────────────────────────────

  server.tool(
    "airtho_browse",
    "Browse document libraries by path. No args → list drives. drive_name + path → list folder contents. " +
      "Prefer job-specific tools for job navigation; use this for non-job drives or deep browsing.",
    {
      drive_name: z.string().describe("Drive name, e.g. 'Jobs', 'Quotes', 'Vendors'. Omit to list all available drives.").optional(),
      path: z.string().describe("Path within the drive, e.g. '051 Factorial/Submittals'. Omit to list drive root. Prefer path over item_id.").optional(),
      item_id: z.string().describe("Internal item ID — only use if you have no path available.").optional(),
      limit: z.number().describe("Max items to return, 1-200 (default: 50)").optional(),
      offset: z.number().describe("Items to skip for pagination (default: 0)").optional(),
    },
    async ({ drive_name, path, item_id, limit, offset }) => {
      const result = await browse({ drive_name, path, item_id, limit, offset, userToken: getUserToken() });
      return toResult(result);
    },
  );

  // ── airtho_search ───────────────────────────────────────────────────────

  server.tool(
    "airtho_search",
    "Full-text search across file names and content in a drive (default: Jobs). " +
      "For job-scoped searches, prefer airtho_find_in_job.",
    {
      query: z.string().describe("Search keywords, e.g. 'temperature review' or 'change order'"),
      drive_name: z.string().describe("Drive to search in (default: 'Jobs')").optional(),
      folder_path: z.string().describe("Scope search to a subfolder path, e.g. '051 Factorial'. Omit to search entire drive.").optional(),
      limit: z.number().describe("Max results to return, 1-200 (default: 50)").optional(),
    },
    async ({ query, drive_name, folder_path, limit }) => {
      const result = await search({ query, drive_name, folder_path, limit, userToken: getUserToken() });
      return toResult(result);
    },
  );

  // ── airtho_read ─────────────────────────────────────────────────────────

  server.tool(
    "airtho_read",
    "Read file content by drive + path. Supports text, CSV, JSON, XML, HTML, Markdown, Word (.docx). " +
      "Returns download URL for PDFs/Excel/images. For job files, prefer airtho_read_job_file.",
    {
      drive_name: z.string().describe("Drive name, e.g. 'Jobs', 'Quotes'"),
      path: z.string().describe("File path within the drive, e.g. '051 Factorial/Factorial_Meeting.docx'. Prefer path over item_id.").optional(),
      item_id: z.string().describe("Internal item ID — only use if you have no path available.").optional(),
    },
    async ({ drive_name, path, item_id }) => {
      const result = await read({ drive_name, path, item_id, userToken: getUserToken() });
      return toResult(result);
    },
  );

  return server;
}
