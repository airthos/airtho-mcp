Run these tests of the `airtho_list_vendors` tool in order. For each test, show the raw result (or a clear summary), then note PASS or FAIL.

**1a.** Call `airtho_list_vendors` with no keyword. Verify you get a list of vendors (or alpha-index folders if the drive is organized that way).

**1b.** Call `airtho_list_vendors` with a keyword that should partially match a vendor name (e.g. a company name you'd expect to find). Verify fuzzy matching works — even if vendors are organized under alpha-index folders like "A's", "B's", the tool should search inside them.

**1c.** Call `airtho_list_vendors` with `keyword` set to `"zzzznotavendor"`. Verify empty list, not an error.

**1d.** Call `airtho_list_vendors` with `limit=2`. Verify the limit is respected.

---

Produce a summary table:

| Test | What was tested | Status | Notes |
|------|-----------------|--------|-------|
| 1a | List all vendors | PASS/FAIL | ... |
| ... | ... | ... | ... |
