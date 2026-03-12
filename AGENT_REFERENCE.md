# Airtho MCP Server — Agent Reference

This document is a complete technical reference for Claude agents working with this codebase.
It is not a user guide. It is a machine-readable spec for building skills, writing tests, debugging, and extending the server.

---

## What This Server Is

An MCP (Model Context Protocol) server that exposes Airtho's Microsoft SharePoint/OneDrive document libraries to Claude via the Microsoft Graph API. It uses the native Azure Functions MCP binding extension (`app.mcpTool()`) — the Functions runtime handles the MCP protocol natively. All tools are read-only.

---

## Transport and Hosting

- **Protocol**: MCP over Streamable HTTP, handled natively by Azure Functions MCP extension
- **Tools registered via**: `app.mcpTool()` from `@azure/functions` (>=4.9.0) — no `@modelcontextprotocol/sdk` needed
- **MCP config**: `host.json` → `extensions.mcp` section (serverName, serverVersion, instructions)
- **Local dev URL**: `http://localhost:7071/runtime/webhooks/mcp`
- **Deployed URL**: `https://<app>.azurewebsites.net/runtime/webhooks/mcp`
- **Auth**: System key `mcp_extension` required via `x-functions-key` header (or set `webhookAuthorizationLevel: "Anonymous"` in host.json)
- **MCP is text-only**. Files are returned as extracted strings, never binary.

---

## Repository Structure

```
airtho-mcp/
├── src/
│   ├── index.ts              # app.mcpTool() registrations for all 6 tools
│   ├── constants.ts          # CHARACTER_LIMIT (50000), GRAPH_BASE_URL
│   ├── types.ts              # All TypeScript interfaces (see below)
│   ├── graph/
│   │   └── client.ts         # Lazy Graph client singleton + getBearerToken()
│   └── tools/
│       ├── list-drives.ts
│       ├── list-drive-children.ts
│       ├── get-item-by-path.ts
│       ├── search-within-folder.ts
│       ├── get-file-metadata.ts
│       └── read-file-content.ts
├── host.json                 # Azure Functions host config + extensions.mcp server settings
├── local.settings.json.example  # Local dev env vars template (never committed)
├── local.settings.json       # NEVER COMMIT — contains real credentials locally
├── .env.example              # Env var template (old Container Apps format, kept for reference)
├── .env                      # NEVER COMMIT — real credentials
├── package.json              # build=node --max-old-space-size=8192 tsc, start=func start
├── tsconfig.json             # module: commonjs, moduleResolution: node, outDir: dist
├── DEPLOY.md                 # Human-readable Azure deployment instructions
└── AGENT_REFERENCE.md        # This file
```

---

## Build and Run

### Prerequisites
- Node.js >= 18
- Azure Functions Core Tools v4 installed globally: `npm install -g azure-functions-core-tools@4`
- `npm install` in the project root

### Local development
```bash
# Copy and fill credentials
cp local.settings.json.example local.settings.json
# edit local.settings.json with real TENANT_ID, CLIENT_ID, CLIENT_SECRET, DEFAULT_SITE_ID

npm start
# → runs: tsc (via prestart) then func start
# → MCP endpoint: http://localhost:7071/runtime/webhooks/mcp
```

**Build note**: The `@microsoft/microsoft-graph-client` package ships massive type definitions. Build requires 8GB heap (`node --max-old-space-size=8192`). The `prebuild` script deletes `tsconfig.tsbuildinfo` to prevent stale incremental cache from skipping emit.

### Build only
```bash
npm run build   # outputs to dist/
npm run clean   # rm -rf dist
```

### TypeScript config
- `"module": "commonjs"`, `"moduleResolution": "node"` — NOT ESM
- `"outDir": "dist"`, `"rootDir": "src"`
- `"strict": true`, `"esModuleInterop": true`
- All source files use `import` syntax which TypeScript compiles to `require()`

---

## Environment Variables

All are read from `process.env` at runtime.

| Variable | Required | Description |
|---|---|---|
| `TENANT_ID` | YES | Azure AD tenant ID (GUID) |
| `CLIENT_ID` | YES | App registration client ID (GUID) |
| `CLIENT_SECRET` | YES | App registration client secret |
| `DEFAULT_SITE_ID` | NO | Fallback SharePoint site ID for tools that accept `site_id`. Format: `airtho.sharepoint.com,<guid>,<guid>` (compound with commas, NOT a URL slug) |

**Startup validation**: If `TENANT_ID`, `CLIENT_ID`, or `CLIENT_SECRET` are missing, the module throws on cold start and the function will not start.

**Local dev**: vars go in `local.settings.json` under `Values`. Azure reads them from Application Settings.

**Site ID format**: The `DEFAULT_SITE_ID` (and any `site_id` arg) must be the full compound Graph site ID. Discover it:
```
GET https://graph.microsoft.com/v1.0/sites/airtho.sharepoint.com:/sites/Airtho
```
The `id` field in the response is the value to use (e.g. `airtho.sharepoint.com,abc123,def456`).

---

## Authentication

### MCP endpoint auth (Claude → Azure Function)
The MCP extension uses a system key `mcp_extension`. Clients must include it via `x-functions-key` header or `?code=` query param. Retrieve with:
```bash
az functionapp keys list --resource-group <RG> --name <APP> --query systemKeys.mcp_extension --output tsv
```

### Graph API auth (Azure Function → SharePoint)
Uses OAuth 2.0 client credentials flow (app-only, no user sign-in).

**Azure AD App Registration must have these application permissions (not delegated), with admin consent granted**:
- `Sites.Read.All`
- `Files.Read.All`

**Graph client**: `src/graph/client.ts` exports:
- `getGraphClient()` — returns a lazy-init `@microsoft/microsoft-graph-client` `Client` instance
- `getBearerToken()` — returns a raw bearer token string for direct `fetch()` calls

Both are singletons per Function worker instance (cold-started once, reused across warm invocations).

---

## MCP Tools — Complete Reference

All tools are registered via `app.mcpTool()` in `src/index.ts`. All are read-only. Tool handlers return JSON-stringified results. Errors are returned as `McpError` objects (`{ error, message }`).

### Tool naming
All tools have the `airtho_` prefix to avoid conflicts with the M365 MCP connector that may be running alongside.

### Error response shape
When a tool call fails, `isError: true` is set on the MCP response and the content is:
```json
{ "error": "<error_code>", "message": "<human readable detail>" }
```

### Success response shape
All successful responses are JSON stringified (2-space indented) and returned as a string from the handler.

---

### `airtho_list_drives`

Lists document library drives on a SharePoint site.

**Input**:
```typescript
{ site_id?: string }
```
- `site_id`: optional. Omit to use `DEFAULT_SITE_ID`.

**Output** (array):
```typescript
DriveInfo[]
// Each: { drive_id: string, name: string, drive_type: string }
```

**Use when**: discovering which drive to target. Run once, record the `drive_id`.

**Errors**:
- `site_not_found` — invalid site ID or missing consent
- `missing_site_id` — no site_id arg and DEFAULT_SITE_ID not set

---

### `airtho_list_drive_children`

Lists immediate children of a folder.

**Input**:
```typescript
{ drive_id: string, item_id: string, limit?: number, offset?: number }
```
- `item_id`: Use `"root"` for the drive root. Otherwise use a Graph item ID.
- `limit`: 1–200, default 50
- `offset`: default 0

**Output**:
```typescript
{ items: DriveItem[], has_more: boolean, total_returned: number }
// DriveItem: { name, id, type: "file"|"folder", modified: string|null, size: number|null }
```

**Pagination**: Check `has_more`. If true, call again with `offset += limit`.

**Errors**:
- `item_not_found` — folder ID not found
- `drive_not_found` — drive ID not accessible

---

### `airtho_get_item_by_path`

Resolves a path string to a Graph item ID.

**Input**:
```typescript
{ drive_id: string, path: string }
```
- `path`: relative to drive root, e.g. `"Jobs/2025-042 Northgate"`. Do not include a leading `/`.

**Output**:
```typescript
ItemMetadata
// { name, id, type: "file"|"folder", modified, size, parent_id }
```

**Use when**: you know the path and want to skip iterating children to find the item ID.

**Errors**:
- `item_not_found` — no item at path
- `drive_not_found` — drive not accessible

---

### `airtho_search_within_folder`

Full-text + filename search scoped to a folder subtree.

**Input**:
```typescript
{ drive_id: string, item_id: string, query: string, limit?: number }
```
- `item_id`: Scope folder. Use root job folder to search all jobs.
- `query`: Search keywords. Matches file names and indexed content.
- `limit`: 1–200, default 50

**Output**:
```typescript
{ results: SearchResult[], has_more: boolean, total_returned: number }
// SearchResult: { name, id, path: string|null, modified, size }
```

**Note**: Search is not idempotent (results can change as files are indexed). `has_more` indicates the result set was truncated.

**Errors**:
- `item_not_found` — folder item ID not found

---

### `airtho_get_file_metadata`

Gets metadata for a specific file including a pre-auth download URL.

**Input**:
```typescript
{ drive_id: string, item_id: string }
```

**Output**:
```typescript
FileMetadata
// { name, id, size: number|null, modified, created, download_url: string|null, mime_type: string|null }
```

- `download_url`: short-lived pre-authenticated URL (~1 hour). Can be given to the human user to download the file directly. Claude cannot use it to download binary files — only the human can.

**Errors**:
- `item_not_found`

---

### `airtho_read_file_content`

Fetches the text content of a file.

**Input**:
```typescript
{ drive_id: string, item_id: string }
```

**Output**:
```typescript
FileContent
// { content: string, mime_type: string, truncated: boolean }
```

**Supported formats** (returns plain text):
- `text/plain`, `text/csv`, `text/html`, `text/markdown`, `text/xml`, `text/javascript`
- `application/json`, `application/xml`, `application/javascript`
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (.docx) — Graph converts to plain text via `?format=text`

**Unsupported** (returns `content_unavailable`):
- `.pdf`, `.xlsx`, `.dwg`, `.pptx`, `.png`, `.jpg`, and any other binary format

**Truncation**: Content is cut at 50,000 characters. If `truncated: true`, call `airtho_get_file_metadata` to get `download_url` and surface it to the user.

**Errors**:
- `content_unavailable` — unsupported MIME type or not a file
- `item_not_found`

---

## TypeScript Types Reference

Defined in `src/types.ts`:

```typescript
// Tool output types
DriveInfo       { drive_id, name, drive_type }
DriveItem       { name, id, type, modified, size }
ItemMetadata    { name, id, type, modified, size, parent_id }
SearchResult    { name, id, path, modified, size }
FileMetadata    { name, id, size, modified, created, download_url, mime_type }
FileContent     { content, mime_type, truncated }
McpError        { error, message }

// Graph API raw response shapes (used internally)
GraphDrive      { id, name, driveType }
GraphItem       { id, name, folder?, file?, lastModifiedDateTime?, createdDateTime?,
                  size?, parentReference?, "@microsoft.graph.downloadUrl"? }
```

---

## Typical Usage Pattern for Skills

A skill that needs to find and read a file in a known job folder:

```
1. airtho_list_drives({ })
   → record drive_id (likely "Documents" or similar)

2. airtho_get_item_by_path({ drive_id, path: "Jobs/2025-042 Northgate" })
   → record folder item_id

3. airtho_list_drive_children({ drive_id, item_id: <folder_id> })
   → find the target file, record file item_id

4. airtho_read_file_content({ drive_id, item_id: <file_id> })
   → read the text content
```

Or if the file name is unknown:
```
3b. airtho_search_within_folder({ drive_id, item_id: <folder_id>, query: "quote" })
    → find file by keyword, record item_id
```

---

## Adding a New Tool

1. Create `src/tools/<tool-name>.ts` — export an async function, return typed result or `McpError`
2. Import it in `src/index.ts`
3. Register with `app.mcpTool("airthoToolName", { toolName: "airtho_tool_name", description: "...", toolProperties: { ... }, handler: async (_toolArgs, context) => { ... } })`
4. Use `arg.string().describe("...")` for required props, add `.optional()` for optional ones
5. Extract args via `context.triggerMetadata?.mcptoolargs`
6. Return `JSON.stringify(result, null, 2)` from the handler
7. Run `npm run build` to verify

Conventions:
- Always return `McpError` from catch blocks, never throw
- Tool names use `airtho_` prefix
- Function registration names use camelCase (`airthoToolName`), tool names use snake_case (`airtho_tool_name`)

---

## Deploying

1. Create Azure Function App (Node.js 22, Linux)
2. Set Application Settings: `TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET`, `DEFAULT_SITE_ID`
3. Deploy: `func azure functionapp publish <app-name>`
4. Get system key: `az functionapp keys list --resource-group <RG> --name <APP> --query systemKeys.mcp_extension --output tsv`
5. MCP endpoint: `https://<app>.azurewebsites.net/runtime/webhooks/mcp`

---

## Connecting to Claude

Add to Claude Desktop or Claude Code MCP config:
```json
{
  "mcpServers": {
    "airtho": {
      "type": "http",
      "url": "https://<app>.azurewebsites.net/runtime/webhooks/mcp",
      "headers": {
        "x-functions-key": "<mcp_extension system key>"
      }
    }
  }
}
```

For local dev:
```json
{
  "mcpServers": {
    "airtho": {
      "type": "http",
      "url": "http://localhost:7071/runtime/webhooks/mcp"
    }
  }
}
```

---

## Known Limitations

- **No write operations** — read-only by design; Graph permissions are `Sites.Read.All` + `Files.Read.All`
- **No PDF text extraction** — Graph API does not convert PDFs to text; only `.docx` conversion is supported
- **No Excel/CSV formula evaluation** — `.xlsx` is unsupported; `.csv` is supported as plain text
- **Content truncated at 50,000 chars** — check `truncated` flag; surface `download_url` to human if needed
- **Search latency** — SharePoint search index may lag behind recent file changes by minutes
- **Download URLs expire** — `download_url` from `get_file_metadata` is valid ~1 hour; request fresh metadata if stale
- **Stateless** — each tool invocation is independent; no session state across requests
