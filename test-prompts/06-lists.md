Run these tests of the SharePoint list tools in order. For each test, show the raw result (or a clear summary), then note PASS or FAIL.

## 1. Discover Lists

**1a.** Call `airtho_list_lists` with no arguments. Verify you get available SharePoint lists with column names, types, and choice values. Note the exact list names and field_names for later tests.

## 2. Get List Items

**2a.** Pick a list from 1a. Call `airtho_get_list_items` with just `list_name`. Verify you get rows with non-system fields and each row has an `sp_id`. Note column names and an `sp_id` for later.

**2b.** Call `airtho_get_list_items` with `list_name` and `columns` set to 2 specific field_names from 1a. Verify only those 2 columns (plus sp_id) are returned.

**2c.** Call `airtho_get_list_items` with `filter_field` and `filter_value` targeting a column with a known value from 2a. Verify all returned items match the filter.

**2d.** Call `airtho_get_list_items` with `filter_value` set to `"zzzzDoesNotMatchAnything"`. Verify empty items array, not an error.

**2e.** Call `airtho_get_list_items` with `limit=2`. Verify exactly 2 or fewer items and `has_more` is correct.

**2f.** Call `airtho_get_list_items` with `list_name` set to `"FakeListThatDoesNotExist99"`. Verify `list_not_found` error.

## 3. Search List

**3a.** Call `airtho_search_list` with a valid `list_name` and a `keyword` matching text in at least one item. Verify matching items with `sp_id` and matched fields.

**3b.** Call `airtho_search_list` with `keyword` set to `"zzzznowaythismatches"`. Verify empty results and `has_more: false`.

**3c.** Call `airtho_search_list` with `limit=1`. Verify only 1 result.

## 4. Get Single Item

**4a.** Using an `sp_id` from test 2a, call `airtho_get_list_item` with `list_name` and `item_id`. Verify full item with all non-system fields.

**4b.** Call `airtho_get_list_item` with `item_id` set to `999999`. Verify `not_found` error.

**4c.** Call `airtho_get_list_item` with a valid `item_id` and `columns` set to 1 specific field. Verify only that column (plus sp_id) is returned.

---

Produce a summary table:

| Test | Tool | What was tested | Status | Notes |
|------|------|-----------------|--------|-------|
| 1a | list_lists | Discover lists | PASS/FAIL | ... |
| ... | ... | ... | ... | ... |
