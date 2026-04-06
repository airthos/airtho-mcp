# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

An MCP (Model Context Protocol) server that exposes Airtho's Microsoft SharePoint/OneDrive document libraries to Claude via the Microsoft Graph API. Uses the MCP SDK (`@modelcontextprotocol/sdk`) with Azure Functions v4 HTTP triggers. Per-user OAuth 2.1 authentication via Entra ID — each Claude user authenticates individually, and Graph API calls run under their identity via the On-Behalf-Of (OBO) flow. All tools are read-only.

## Commands

```bash
# Install dependencies
npm install

# Build (outputs to dist/)
npm run build

# Start locally (builds first, then runs func start)
npm start

# Local MCP endpoint: http://localhost:7071/mcp

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
- Set `REQUIRE_AUTH=false` to skip OAuth for local dev (tools fall back to service account)

## Architecture

### MCP Transport

The server uses `WebStandardStreamableHTTPServerTransport` from the MCP SDK, served via Azure Functions HTTP triggers. This replaced the native `app.mcpTool()` binding to enable access to HTTP `Authorization` headers for per-user auth.

Entry point: `src/index.ts` registers HTTP routes (`/mcp`, `/authorize`, `/token`, `/callback`, `/register`, `/.well-known/*`).

### Tool Registration

All 13 MCP tools are registered in `src/mcp-server.ts` via the MCP SDK's `McpServer.tool()` with Zod input schemas. Tool implementations live in `src/tools/*.ts`.

| Category | Tools |
|---|---|
| Job tools | `airtho_search_jobs`, `airtho_get_job`, `airtho_find_in_job`, `airtho_read_job_file`, `airtho_get_recent_jobs` |
| Drive tools | `airtho_browse`, `airtho_search`, `airtho_read` |
| Vendor tools | `airtho_list_vendors` |
| List tools | `airtho_list_lists`, `airtho_get_list_items`, `airtho_search_list`, `airtho_get_list_item` |

Tools use `airtho_` prefix to avoid conflicts with Microsoft's M365 MCP connector.

### OAuth 2.1 Authentication

Claude requires the MCP server to act as its own OAuth authorization server (Entra ID doesn't support Dynamic Client Registration). The server implements an OAuth proxy in `src/auth/proxy.ts`:

| Endpoint | Purpose |
|---|---|
| `/.well-known/oauth-protected-resource` | RFC 9728 — tells Claude where to get tokens (points to ourselves) |
| `/.well-known/oauth-authorization-server` | RFC 8414 — advertises our OAuth endpoints |
| `/register` | DCR — accepts Claude's client registration, returns our Entra client_id |
| `/authorize` | Redirects to Entra ID login with our app credentials |
| `/callback` | Receives Entra redirect after login, redirects back to Claude with auth code |
| `/token` | Exchanges auth code with Entra, returns access token to Claude |

The token Claude receives is an Entra ID access token. Tool handlers read it from `AsyncLocalStorage` (`src/auth/token-store.ts`) and use it for OBO Graph calls.

### Graph Client (`src/graph/client.ts`)

Two modes:
- `getGraphClient(userToken)` — OBO flow: exchanges user token for a Graph token acting as that user (production)
- `getGraphClient()` — service account singleton via `ClientSecretCredential` (local dev fallback)

OBO logic lives in `src/auth/obo.ts`. All tool and resolver files accept an optional `userToken` parameter.

### TypeScript Config

- `"module": "commonjs"`, `"moduleResolution": "node"` — NOT ESM
- Source uses `import` syntax; TypeScript compiles to `require()`
- `"strict": true`, `"esModuleInterop": true`

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `TENANT_ID` | YES | Entra ID tenant ID (GUID) |
| `CLIENT_ID` | YES | App registration client ID (GUID) |
| `CLIENT_SECRET` | YES | App registration client secret |
| `DEFAULT_SITE_ID` | NO | Fallback SharePoint site ID — format: `airtho.sharepoint.com,<guid>,<guid>` |
| `REQUIRE_AUTH` | NO | Set to `"false"` to disable OAuth (local dev). Default: `"true"` |
| `MCP_RESOURCE_URI` | NO | Public URL of the server. Auto-detected from request headers if not set |

Missing `TENANT_ID`/`CLIENT_ID`/`CLIENT_SECRET` throws on module load (validated in `src/index.ts`).

Local dev: vars go in `local.settings.json` under `Values`. Azure reads them from Application Settings.

### Entra ID App Registration Requirements

- **Application permissions**: `Sites.Read.All` (for service account fallback)
- **Delegated permissions**: `Sites.Read.All`, `Files.Read.All`, `User.Read`
- **Expose an API**: scope `api://<CLIENT_ID>/mcp.access` (admins and users can consent)
- **Redirect URI**: `https://<your-azure-app>.azurewebsites.net/callback` (Web platform)
- **Allow public client flows**: No (only needed for device code testing)

## Adding a New Tool

1. Create `src/tools/<tool-name>.ts` — export an async function with `userToken?: string` parameter, returning typed result or `McpError`
2. Import and register in `src/mcp-server.ts` with `server.tool()` and a Zod input schema
3. Use `getUserToken()` from `src/auth/token-store.ts` and pass it to the tool function
4. Pass `userToken` to `getGraphClient(userToken)` for per-user Graph calls
5. Always return `McpError` from catch blocks, never throw

## Important Notes

- **MCP is text-only** — files are returned as extracted strings, never binary
- **Content truncated at 50,000 chars** (`CHARACTER_LIMIT` in `src/constants.ts`) — check `truncated` flag; surface `download_url` to the user if needed
- **No PDF text extraction** — `.docx` is supported via native ZIP parsing; PDFs are not (liteparse exploration stashed)
- **`local.settings.json` and `.env` must never be committed** — they contain real credentials
- **OAuth proxy state is in-memory** — pending auth codes and DCR registrations are lost on worker restart; this is fine because the OAuth flow completes in seconds
