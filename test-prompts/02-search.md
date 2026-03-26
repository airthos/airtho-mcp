Run these tests of the `airtho_search` tool in order. For each test, show the raw result (or a clear summary), then note PASS or FAIL.

## 1. Basic Search

**1a.** Call `airtho_search` with just a `query` (a common word that should match something). Don't specify `drive_name`. Verify it defaults to the Jobs drive. Verify results include file names and paths.

**1b.** Call `airtho_search` with `query` and an explicit `drive_name` that is NOT Jobs. Verify the search runs against the specified drive.

## 2. Folder Scoping

**2a.** Call `airtho_search` with `query`, `drive_name`, and `folder_path` set to a specific subfolder. Verify results are scoped — all results should be under that folder path.

## 3. Edge Cases

**3a.** Call `airtho_search` with `query` set to `"zzzzxqwerty9999unicorn"`. Verify you get an empty results array, not an error.

**3b.** Call `airtho_search` with `limit=2`. Verify only 2 results come back. Verify `has_more` is true (assuming the query has more matches).

---

Produce a summary table:

| Test | What was tested | Status | Notes |
|------|-----------------|--------|-------|
| 1a | Default drive search | PASS/FAIL | ... |
| ... | ... | ... | ... |
