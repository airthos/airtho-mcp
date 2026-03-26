Run these tests of the `airtho_read` tool in order. For each test, show the raw result (or a clear summary), then note PASS or FAIL.

First, use `airtho_browse` to find files of different types (.txt/.csv, .docx, .pdf, .png/.jpg/.xlsx) in any drive. Note their paths.

## 1. Supported Formats

**1a.** Call `airtho_read` on a `.txt` or `.csv` file. Verify you get `content` as a string, `mime_type`, and `truncated: false` for small files.

**1b.** Call `airtho_read` on a `.docx` file. Verify text was extracted. Verify `mime_type` is `text/plain`.

## 2. Unsupported Formats

**2a.** Call `airtho_read` on a `.pdf` file. Verify you get `unsupported_format` with a `download_url`.

**2b.** Call `airtho_read` on an image or Excel file. Verify you get `unsupported_format` with a `download_url`.

## 3. Error Paths

**3a.** Call `airtho_read` with a valid `drive_name` but `path` set to `"nonexistent_file_that_does_not_exist.txt"`. Verify `not_found` error.

**3b.** Call `airtho_read` with a valid `drive_name` but neither `path` nor `item_id`. Verify `invalid_input` error.

**3c.** If you have an `item_id` from a browse result, call `airtho_read` with `drive_name` and `item_id` (no path). Verify it works the same as by path.

**3d.** Call `airtho_read` with `path` pointing to a folder. Verify `not_a_file` error telling you to use browse.

---

Produce a summary table:

| Test | What was tested | Status | Notes |
|------|-----------------|--------|-------|
| 1a | Read plain text/CSV | PASS/FAIL | ... |
| ... | ... | ... | ... |
