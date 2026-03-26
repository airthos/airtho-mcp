Run these tests of the job-specific tools in order. For each test, show the raw result (or a clear summary), then note PASS or FAIL.

## 1. search_jobs

**1a.** Call `airtho_search_jobs` with no keyword. Verify you get a list of all jobs with `job_number` and `job_name`.

**1b.** Call `airtho_search_jobs` with a partial/fuzzy keyword that should match at least one job. Verify fuzzy matching works.

**1c.** Call `airtho_search_jobs` with `keyword` set to `"zzzznowaythisexists"`. Verify empty list, not an error.

**1d.** Call `airtho_search_jobs` with `limit=3`. Verify exactly 3 or fewer results.

## 2. get_job

**2a.** Call `airtho_get_job` with a keyword that uniquely identifies a job. Verify you get the full folder/file structure. Verify subfolders and files are visible.

**2b.** Call `airtho_get_job` with a vague keyword that could match multiple jobs. Verify it picks the best match and shows `alternatives` for the other matches.

**2c.** Call `airtho_get_job` with `"zzzznowaythisexists"`. Verify meaningful error.

## 3. find_in_job

**3a.** Call `airtho_find_in_job` with a valid job keyword and a file keyword matching a known file in that job (use a name you saw in test 2a). Verify results are scoped to that job with file names and paths.

**3b.** Call `airtho_find_in_job` with a valid job keyword but file keyword `"zzzznotafile"`. Verify empty results.

**3c.** Call `airtho_find_in_job` with `limit=1`. Verify only 1 result.

## 4. read_job_file

**4a.** Call `airtho_read_job_file` with a valid job keyword and file keyword matching a .docx or .txt. Verify file content is returned.

**4b.** Call `airtho_read_job_file` with a valid job keyword and file keyword matching a PDF. Verify `unsupported_format` with `download_url`.

**4c.** Call `airtho_read_job_file` with a job keyword that doesn't match any job. Verify `job_not_found` error.

## 5. get_recent_jobs

**5a.** Call `airtho_get_recent_jobs` with no arguments. Verify jobs are sorted newest first (first item's date > last item's date).

**5b.** Call `airtho_get_recent_jobs` with `limit=2`. Verify exactly 2 results.

---

Produce a summary table:

| Test | Tool | What was tested | Status | Notes |
|------|------|-----------------|--------|-------|
| 1a | search_jobs | List all jobs | PASS/FAIL | ... |
| ... | ... | ... | ... | ... |
