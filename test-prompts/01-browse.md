Run these tests of the `airtho_browse` tool in order. For each test, show the raw result (or a clear summary), then note PASS or FAIL. Don't skip any test even if an earlier one fails.

## 1. Drive Discovery

**1a.** Call `airtho_browse` with no arguments. Verify the response contains an array of drive names. Note the exact drive names — you'll need them below.

**1b.** Call `airtho_browse` with `drive_name` set to `"DefinitelyFakeDrive99"`. Verify you get a `drive_not_found` error that lists available drives.

## 2. Folder Navigation

Using a real drive name from 1a:

**2a.** Call `airtho_browse` with just `drive_name` (no path). Confirm the response includes `items` with `name`, `item_id`, `type`, `modified`, and `size` fields. Note whether `has_more` is true or false.

**2b.** Pick a folder from the root listing. Call `airtho_browse` with `drive_name` and `path` set to that folder's name. Verify you get the folder's children.

**2c.** Navigate deeper: call `airtho_browse` with a 2-level path like `"SomeFolder/SomeSubfolder"` using real names from 2b. Verify multi-segment paths work.

**2d.** Call `airtho_browse` with `path` set to `"this/path/does/not/exist/at/all"`. Verify you get a `not_found` error.

## 3. Pagination

**3a.** Call `airtho_browse` on a folder with many items, `limit=3`, `offset=0`. Note the 3 items and whether `has_more` is true.

**3b.** Call again with `limit=3`, `offset=3`. Verify different items (no overlap with 3a). Verify `has_more` reflects whether more items exist.

## 4. File Path

**4a.** Call `airtho_browse` with `path` pointing to a file (not a folder). Verify the response returns a single `file` object with `download_url` and `mime_type` instead of an `items` array.

---

Produce a summary table:

| Test | What was tested | Status | Notes |
|------|-----------------|--------|-------|
| 1a | List drives (no args) | PASS/FAIL | ... |
| ... | ... | ... | ... |
