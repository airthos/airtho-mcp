# Airtho MCP Server — Agent Reference

This document is a complete technical reference for Claude agents working with this codebase.

---

## What This Server Is

An MCP (Model Context Protocol) server that exposes Airtho's Microsoft SharePoint/OneDrive document libraries to Claude via the Microsoft Graph API. It uses the native Azure Functions MCP binding (`app.mcpTool()`) — the Functions runtime handles MCP protocol natively. All tools are read-only.

---

## Transport and Hosting

- **Protocol**: MCP over Streamable HTTP, handled natively by Azure Functions MCP extension
- **Tools registered via**: `app.mcpTool()` from `@azure/functions` (>=4.9.0) — no `@modelcontextprotocol/sdk` needed
- **MCP config**: `host.json` → `extensions.mcp` section (serverName, serverVersion, instructions)
- **Local dev URL**: `http://localhost:7071/runtime/webhooks/mcp`
- **Deployed URL**: `https://<app>.azurewebsites.net/runtime/webhooks/mcp`
- **Auth**: System key `mcp_extension` required via `x-functions-key` header
- **MCP is text-only**. Files are returned as extracted strings, never binary.

---

## Repository Structure

```
airtho-mcp/
├── src/
│   ├── index.ts              # app.mcpTool() registrations for all 3 tools
│   ├── constants.ts          # CHARACTER_LIMIT (50000), GRAPH_BASE_URL
│   ├── types.ts              # McpError, GraphDrive, GraphItem interfaces
│   ├── graph/
│   │   └── client.ts         # Lazy Graph client singleton + getBearerToken()
│   └── tools/
│       ├── resolve-drive.ts  # Drive name→ID resolution + drive list cache
│       ├── browse.ts
│       ├── search.ts
│       └── read.ts
├── host.json                 # Azure Functions host config + extensions.mcp server settings
├── local.settings.json.example  # Local dev env vars template (never committed)
├── DEPLOY.md                 # Azure deployment instructions
└── AGENT_REFERENCE.md        # This file
```

---

## Build and Run

### Prerequisites
- Node.js >= 18
- Azure Functions Core Tools v4: `npm install -g azure-functions-core-tools@4`
- `npm install` in the project root

### Local development
```bash
cp local.settings.json.example local.settings.json
# fill in TENANT_ID, CLIENT_ID, CLIENT_SECRET, DEFAULT_SITE_ID

npm start
# → runs: tsc (via prestart) then func start
# → MCP endpoint: http://localhost:7071/runtime/webhooks/mcp
```

**Build note**: The `@microsoft/microsoft-graph-client` package ships massive type definitions. Build requires 8GB heap (`node --max-old-space-size=8192`). The `prebuild` script deletes `tsconfig.tsbuildinfo` to prevent stale incremental cache.

### TypeScript config
- `"module": "commonjs"`, `"moduleResolution": "node"` — NOT ESM
- `"outDir": "dist"`, `"rootDir": "src"`
- `"strict": true`, `"esModuleInterop": true`
- All source files use `import` syntax which TypeScript compiles to `require()`

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `TENANT_ID` | YES | Azure AD tenant ID (GUID) |
| `CLIENT_ID` | YES | App registration client ID (GUID) |
| `CLIENT_SECRET` | YES | App registration client secret |
| `DEFAULT_SITE_ID` | YES | SharePoint site ID. Format: `airtho.sharepoint.com,<guid>,<guid>` |

**Startup validation**: If `TENANT_ID`, `CLIENT_ID`, or `CLIENT_SECRET` are missing, the module throws on cold start.

**Site ID discovery**:
```
GET https://graph.microsoft.com/v1.0/sites/airtho.sharepoint.com:/sites/Airtho
```
The `id` field is the compound site ID (e.g. `airtho.sharepoint.com,abc123,def456`).

---

## Authentication

### MCP endpoint auth (Claude → Azure Function)
The MCP extension uses a system key `mcp_extension`. Retrieve with:
```bash
az functionapp keys list --resource-group <RG> --name <APP> --query systemKeys.mcp_extension --output tsv
```

### Graph API auth (Azure Function → SharePoint)
OAuth 2.0 client credentials flow (app-only). Required **application permissions** with admin consent:
- `Sites.Read.All`
- `Files.Read.All`

**Graph client**: `src/graph/client.ts` exports:
- `getGraphClient()` — lazy-init `@microsoft/microsoft-graph-client` `Client` instance
- `getBearerToken()` — raw bearer token string for direct `fetch()` calls

Both are singletons per Function worker instance.

---

## Drive Resolution (`src/tools/resolve-drive.ts`)

Tools accept human-readable drive names (e.g. `"Jobs"`) instead of opaque Graph drive IDs. `resolve-drive.ts` handles the translation:

- `resolveDrive(driveName)` — case-insensitive match against live drives for the configured site; returns `{ driveId, driveName }` or `McpError`
- `listAllDrives()` — returns all drives as `{ name, description }[]`
- Drive list is **cached per cold-start** (`_driveCache`). Drives rarely change.

---

## MCP Tools — Complete Reference

All tools are registered in `src/index.ts` via `app.mcpTool()`. Tool args are extracted via:
```typescript
context.triggerMetadata?.mcptoolargs as Record<string, unknown>
```
(Not from the `_toolArgs` parameter — that is unused.)

All tools use the `airtho_` prefix. Registration names are camelCase (`airthoBrowse`), tool names snake_case (`airtho_browse`).

### Error response shape
```json
{ "error": "<error_code>", "message": "<human readable detail>" }
```

### Success response shape
All handlers return `JSON.stringify(result, null, 2)`.

---

### `airtho_browse`

Navigate drives and folders by name. No opaque IDs needed.

**Input**:
```typescript
{
  drive_name?: string   // e.g. "Jobs". Omit to list all available drives.
  path?: string         // e.g. "051 Factorial/Submittals". Omit for drive root.
  item_id?: string      // Item ID from a prior browse/search result (faster than path).
  limit?: number        // 1–200, default 50
  offset?: number       // default 0
}
```

**Output** (one of):
```typescript
// No drive_name → drive list
{ drives: { name: string; description: string }[] }

// path points to a file → file metadata
{ drive_name, path, file: { name, item_id, type: "file", modified, size, mime_type, download_url } }

// path/item_id points to a folder → folder contents
{ drive_name, path, items: BrowseItem[], has_more, total_returned }
// BrowseItem: { name, item_id, type: "file"|"folder", modified, size }
```

**Pagination**: Check `has_more`. If true, call again with `offset += limit`.

**Errors**: `drive_not_found`, `not_found`, `missing_site_id`, `graph_error`

---

### `airtho_search`

Full-text + filename search within a drive.

**Input**:
```typescript
{
  query: string         // Search keywords
  drive_name?: string   // default "Jobs"
  folder_path?: string  // Scope to subfolder, e.g. "051 Factorial". Omit to search entire drive.
  limit?: number        // 1–200, default 50
}
```

**Output**:
```typescript
{
  drive_name: string
  query: string
  scoped_to: string      // "/" or the folder_path
  results: SearchHit[]
  has_more: boolean
  total_returned: number
}
// SearchHit: { name, item_id, type: "file"|"folder", path: string|null, modified, size }
```

**Note**: `has_more: true` when results hit the limit. Search index may lag recent file changes by minutes.

**Errors**: `drive_not_found`, `not_found`, `graph_error`

---

### `airtho_read`

Read the text content of a file. For unsupported binary formats, returns a download URL to share with the user.

**Input**:
```typescript
{
  drive_name: string    // e.g. "Jobs"
  path?: string         // e.g. "051 Factorial/scope.docx"
  item_id?: string      // From a prior browse/search result (use instead of path)
}
```
Either `path` or `item_id` is required.

**Output** (one of):
```typescript
// Supported text format
{ drive_name, file_name, content: string, mime_type, truncated: boolean }

// Unsupported binary format (PDF, Excel, images, etc.)
{ drive_name, file_name, error: "unsupported_format", message, mime_type, download_url: string|null }
```

**Supported formats** (returns plain text):
- `text/plain`, `text/csv`, `text/html`, `text/markdown`, `text/xml`, `text/javascript`
- `application/json`, `application/xml`, `application/javascript`
- `.docx` — extracted directly from the ZIP using Node built-ins (no external library)

**Unsupported**: `.pdf`, `.xlsx`, `.pptx`, `.dwg`, `.png`, `.jpg`, and all other binary formats

**Truncation**: Content cut at 50,000 chars. If `truncated: true`, surface `download_url` (from `airtho_browse`) to the user.

**Errors**: `not_a_file`, `not_found`, `invalid_input`, `content_unavailable`, `graph_error`

---

## TypeScript Types Reference

Defined in `src/types.ts` (shared internal types only):

```typescript
McpError     { error: string; message: string }
GraphDrive   { id, name, driveType }
GraphItem    { id, name, folder?, file?, lastModifiedDateTime?, createdDateTime?,
               size?, parentReference?, "@microsoft.graph.downloadUrl"? }
```

Tool-specific output types are defined inline in each tool file.

---

## Typical Usage Pattern

```
1. airtho_browse({ })
   → list available drives, pick drive_name

2. airtho_browse({ drive_name: "Jobs", path: "051 Factorial" })
   → list folder contents, find target file, record item_id

3. airtho_read({ drive_name: "Jobs", item_id: <file_id> })
   → read text content
```

Or when file name is unknown:
```
2b. airtho_search({ query: "temperature review", drive_name: "Jobs", folder_path: "051 Factorial" })
    → find file by keyword, record item_id
```

---

## Adding a New Tool

1. Create `src/tools/<tool-name>.ts` — export an async function returning typed result or `McpError`
2. Import it in `src/index.ts`
3. Register with `app.mcpTool("airthoToolName", { toolName: "airtho_tool_name", description: "...", toolProperties: { ... }, handler: async (_toolArgs, context) => { ... } })`
4. Use `arg.string().describe("...")` for required props, `.optional()` for optional ones
5. Extract args via `context.triggerMetadata?.mcptoolargs`
6. Return `JSON.stringify(result, null, 2)` from the handler

Conventions:
- Always return `McpError` from catch blocks, never throw
- Tool names: `airtho_` prefix, snake_case
- Registration names: camelCase (`airthoToolName`)

---

## Deploying

1. Create Azure Function App (Node.js 22, Linux, consumption plan)
2. Set Application Settings: `TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET`, `DEFAULT_SITE_ID`
3. Deploy: `func azure functionapp publish <app-name> --node`
4. Get system key: `az functionapp keys list --resource-group <RG> --name <APP> --query systemKeys.mcp_extension --output tsv`
5. MCP endpoint: `https://<app>.azurewebsites.net/runtime/webhooks/mcp`

---

## Connecting to Claude

```json
{
  "mcpServers": {
    "airtho": {
      "type": "http",
      "url": "https://<app>.azurewebsites.net/runtime/webhooks/mcp",
      "headers": { "x-functions-key": "<mcp_extension system key>" }
    }
  }
}
```

For local dev (no auth header needed):
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

- **No write operations** — read-only; Graph permissions are `Sites.Read.All` + `Files.Read.All`
- **No PDF text extraction** — `.docx` extracted from ZIP; PDFs are not supported
- **No Excel/CSV formula evaluation** — `.xlsx` unsupported; `.csv` supported as plain text
- **Content truncated at 50,000 chars** — check `truncated` flag; surface `download_url` to user if needed
- **Search latency** — SharePoint search index may lag recent file changes by minutes
- **Drive cache** — drive list cached per cold-start; restart the function if drives change
- **Stateless** — each tool invocation is independent; no session state across requests
