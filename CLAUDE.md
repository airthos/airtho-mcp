# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

An MCP (Model Context Protocol) server that exposes Airtho's Microsoft SharePoint/OneDrive document libraries to Claude via the Microsoft Graph API. It uses the native Azure Functions MCP binding (`app.mcpTool()`) — the Functions runtime handles MCP protocol natively. All tools are read-only.

## Commands

```bash
# Install dependencies
npm install

# Build (outputs to dist/)
npm run build

# Start locally (builds first, then runs func start)
npm start

# Local MCP endpoint: http://localhost:7071/runtime/webhooks/mcp

# Deploy to Azure
func azure functionapp publish airtho-mcp --node

# Clean build artifacts
npm run clean
```

**Build note**: The `@microsoft/microsoft-graph-client` package has massive type definitions. Build requires 8GB heap (already configured in package.json). The `prebuild` script deletes `tsconfig.tsbuildinfo` to prevent stale incremental cache.

**Local dev requires**:
- Azure Functions Core Tools v4: `npm install -g azure-functions-core-tools@4`
- `local.settings.json` filled with real credentials (copy from `local.settings.json.example`)
- Azurite for local storage emulation: `npm install -g azurite && azurite --silent --location /tmp/azurite &` (or replace `UseDevelopmentStorage=true` with a real Azure Storage connection string)

## Architecture

### Tool Registration

All MCP tools are registered in [src/index.ts](src/index.ts) via `app.mcpTool()`. There are **3 high-level tools**:

| Tool | Function | Purpose |
|---|---|---|
| `airtho_browse` | `browse()` | Navigate drives/folders by name or path; list drives with no args |
| `airtho_search` | `search()` | Full-text + filename search, scoped to a drive or subfolder |
| `airtho_read` | `read()` | Read file text content; returns download URL for unsupported types |

Tools use `airtho_` prefix to avoid conflicts with Microsoft's M365 MCP connector. Registration names are camelCase (`airthoBrowse`), tool names are snake_case (`airtho_browse`).

### Tool Argument Extraction

Tool args are **not** in the `_toolArgs` parameter — they must be extracted via:
```typescript
context.triggerMetadata?.mcptoolargs as Record<string, unknown>
```

### Graph Client (`src/graph/client.ts`)

Lazy singleton pattern. Two exports:
- `getGraphClient()` — returns a `@microsoft/microsoft-graph-client` `Client` instance (for standard Graph SDK calls)
- `getBearerToken()` — returns a raw bearer token string (for direct `fetch()` calls, e.g. file content download)

Both are initialized once per Function worker instance and reused across warm invocations.

### TypeScript Config

- `"module": "commonjs"`, `"moduleResolution": "node"` — NOT ESM
- Source uses `import` syntax; TypeScript compiles to `require()`
- `"strict": true`, `"esModuleInterop": true`

### MCP Config

Server-level instructions and metadata live in `host.json` under `extensions.mcp`. This is where drive name hints are surfaced to Claude.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `TENANT_ID` | YES | Azure AD tenant ID (GUID) |
| `CLIENT_ID` | YES | App registration client ID (GUID) |
| `CLIENT_SECRET` | YES | App registration client secret |
| `DEFAULT_SITE_ID` | NO | Fallback SharePoint site ID — format: `airtho.sharepoint.com,<guid>,<guid>` |

Missing `TENANT_ID`/`CLIENT_ID`/`CLIENT_SECRET` throws on module load (validated in `src/index.ts`).

Local dev: vars go in `local.settings.json` under `Values`. Azure reads them from Application Settings.

## Adding a New Tool

1. Create `src/tools/<tool-name>.ts` — export an async function returning typed result or `McpError`
2. Import and register in `src/index.ts` with `app.mcpTool()`
3. Use `arg.string().describe("...")` for required props; add `.optional()` for optional ones
4. Extract args via `context.triggerMetadata?.mcptoolargs`
5. Return `JSON.stringify(result, null, 2)` from the handler
6. Always return `McpError` from catch blocks, never throw

## Important Notes

- **AGENT_REFERENCE.md is outdated** — it describes the old 6 low-level tools. The codebase was refactored to 3 high-level tools (`browse`, `search`, `read`).
- **MCP is text-only** — files are returned as extracted strings, never binary
- **Content truncated at 50,000 chars** (`CHARACTER_LIMIT` in `src/constants.ts`) — check `truncated` flag; surface `download_url` to the user if needed
- **No PDF text extraction** — `.docx` is supported via Graph `?format=text`; PDFs are not
- **`local.settings.json` and `.env` must never be committed** — they contain real credentials
