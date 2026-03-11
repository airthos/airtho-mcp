# Airtho Azure MCP Server — Build Briefing
**For: Claude Code  ·  March 2026**

---

## Design Philosophy

The MCP server is **infrastructure, not intelligence**. It does only what Claude can't do on its own — authenticated Graph API calls and drive-scoped file operations. All job-specific reasoning (what folder names mean, how to interpret results, what to do next) is handled by a separate Claude skill that instructs Claude how to use these tools. This keeps the server simple, durable, and rarely needing changes.

**MCP server does:** auth, folder listing, path resolution, scoped search, file reading.
**Skill does:** job numbering conventions, subfolder name variants, result interpretation, workflow logic.

---

## Infrastructure Context

- **M365 tenant**: Airtho runs Microsoft 365 Business/Team Pro.
- **Initial scope**: One SharePoint site — `AirthoJobs`. The server should be designed so additional sites can be added later without architectural changes (e.g. site ID passed as a config value or tool parameter, not hardcoded).
- **Azure**: AAD tenant already exists (tied to the M365 subscription). No separate Azure subscription has been set up yet — one will need to be created or confirmed.
- **Hosting preference**: Azure Functions (consumption plan) or Azure Container Apps. Cost should be negligible at Airtho's usage volume (~12 users, low query frequency).

---

## Authentication

Use **OAuth 2.0 client credentials flow** (app-only, no user sign-in required):

1. Register an **Azure App Registration** in the existing AAD tenant
2. Grant it **Microsoft Graph API permissions**:
   - `Files.Read.All` — read files across drives
   - `Sites.Read.All` — read SharePoint sites and document libraries
3. Generate a **client secret** (or certificate — either works)
4. The server authenticates as the app, not as any individual user

Credentials (tenant ID, client ID, client secret) should be stored in **Azure Key Vault** or as **App Service environment variables** — not hardcoded.

---

## MCP Protocol

The server must implement the [MCP spec](https://modelcontextprotocol.io/docs). Key points:

- Transport: **HTTP + SSE** (Claude connects via a URL endpoint)
- The server exposes a set of **tools** with defined input schemas
- Claude calls tools by name with JSON arguments; the server returns structured results
- No session state required — each tool call is stateless

Use the official **MCP TypeScript SDK** (`@modelcontextprotocol/sdk`) or Python SDK (`mcp`) to handle protocol boilerplate.

---

## Tools to Expose

Six primitive tools. Inputs are explicit IDs and paths — Claude is responsible for resolving job names and navigating folder logic before calling these. The server does not do fuzzy matching or business logic.

### `list_drive_children`
List the immediate children of any folder by drive ID and item ID.
- Input: `drive_id` (string), `item_id` (string)
- Returns: array of `{ name, id, type (file|folder), modified, size }`
- Use case: enumerate job folders, list subfolder contents

### `get_item_by_path`
Resolve a path string to its Graph item ID and metadata.
- Input: `drive_id` (string), `path` (string)
- Returns: `{ name, id, type, modified, size, parent_id }`

### `search_within_folder`
Search for files by keyword within a specific folder subtree.
- Input: `drive_id` (string), `item_id` (string), `query` (string)
- Returns: array of `{ name, id, path, modified, size }`
- Scoped to the provided folder — not tenant-wide

### `get_file_metadata`
Get metadata for a specific file by item ID.
- Input: `drive_id` (string), `item_id` (string)
- Returns: `{ name, id, size, modified, created, download_url, mime_type }`

### `read_file_content`
Fetch the text content of a file. Best-effort text extraction for Office and PDF formats.
- Input: `drive_id` (string), `item_id` (string)
- Returns: `{ content (string), mime_type, truncated (bool) }`
- Truncate at a reasonable token limit (e.g. ~50k chars) and flag it

### `list_drives`
List available drives on a configured SharePoint site.
- Input: optional `site_id` (string — defaults to the configured site if omitted)
- Returns: array of `{ drive_id, name, drive_type }`
- Use case: one-time orientation / drive ID discovery; Brendan records the relevant drive IDs in the skill

---

## Graph API Patterns

```
# List drives on a SharePoint site
GET /sites/{site-id}/drives

# List children of a folder
GET /drives/{drive-id}/items/{item-id}/children

# Search within a folder subtree
GET /drives/{drive-id}/items/{item-id}/search(q='{query}')

# Resolve a path to an item
GET /drives/{drive-id}/root:/{path}

# Get file content
GET /drives/{drive-id}/items/{item-id}/content
```

Avoid the tenant-wide `/search/query` endpoint with `path:` filtering — it is unreliable on deeply nested SharePoint Online folder structures. Prefer drive-scoped endpoints throughout.

---

## Error Handling

Return structured errors Claude can reason about — not stack traces:

```json
{ "error": "item_not_found", "message": "No item at path 'Folder/Subfolder'" }
{ "error": "drive_not_found", "message": "Drive ID 'b!abc123' not accessible" }
{ "error": "content_unavailable", "message": "File type .dwg not supported for text extraction" }
```

---

## Suggested Tech Stack

- **Runtime**: Node.js (TypeScript) or Python — either works with the MCP SDK
- **MCP SDK**: `@modelcontextprotocol/sdk` (TS) or `mcp` (Python)
- **Graph API client**: `@microsoft/microsoft-graph-client` (TS) or `msgraph-sdk-python`
- **Auth**: `@azure/identity` — use `ClientSecretCredential` or `CertificateCredential`
- **Hosting**: Azure Functions v4 (HTTP trigger) or Azure Container Apps
- **Secrets**: Azure Key Vault or Function App environment variables

---

## What's Not in Scope (for now)

- Any domain or folder-specific business logic — handled by Claude skill
- Write operations (creating/uploading files)
- Teams or Outlook integration (handled by the existing M365 MCP connector)
- User-level auth (app-only is sufficient for read access)

---

## Open Questions to Resolve Before or During Build

1. **SharePoint site ID** — The `AirthoJobs` site ID needs to be confirmed and stored in config at deploy time.
2. **Drive ID(s)** — Relevant document library drive IDs should be enumerated via `list_drives` at setup and recorded in the skill.
3. **Azure subscription** — Confirm whether one exists or needs to be created under the M365 tenant.
4. **App Registration permissions** — Will need an M365 admin (Brandon) to grant admin consent for `Files.Read.All` and `Sites.Read.All`.
5. **MCP endpoint URL** — Once deployed, Brendan will register this URL in Claude's MCP connector settings.

---

*Built and maintained by Brendan Ballon — Airtho IT & Digital Integration*
