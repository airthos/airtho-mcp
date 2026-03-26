Run these cross-cutting validation checks across the Airtho MCP tools. For each check, call the relevant tools and note PASS or FAIL.

## 1. Truncation

**1a.** Find and read the largest text-readable file you can (use `airtho_search` then `airtho_read`). Check whether `truncated` is true and whether content was cut near 50,000 characters. If no file is large enough to trigger truncation, note as NOT VERIFIABLE.

## 2. Human-Readable Identifiers

**2a.** Call `airtho_browse` on a drive, `airtho_search` for something, and `airtho_get_job` for a job. Review all three responses. Verify no tool returned opaque SharePoint/Graph IDs as the primary identifier — all results should use human-readable names and paths. `item_id` values are acceptable as supplementary fields.

## 3. Error Format Consistency

**3a.** Trigger 3 different errors:
- Call `airtho_browse` with a fake drive name
- Call `airtho_read` with neither path nor item_id
- Call `airtho_get_job` with `"zzzznowaythisexists"`

Verify every error follows the `{ error: "error_type", message: "..." }` pattern. No raw exceptions or stack traces.

## 4. Tool Count

**4a.** Confirm you can access all 13 tools:
`airtho_browse`, `airtho_search`, `airtho_read`, `airtho_search_jobs`, `airtho_get_job`, `airtho_find_in_job`, `airtho_read_job_file`, `airtho_get_recent_jobs`, `airtho_list_vendors`, `airtho_list_lists`, `airtho_get_list_items`, `airtho_search_list`, `airtho_get_list_item`.

---

Produce a summary table:

| Test | What was tested | Status | Notes |
|------|-----------------|--------|-------|
| 1a | Truncation at 50k chars | PASS/FAIL/NOT VERIFIABLE | ... |
| ... | ... | ... | ... |
