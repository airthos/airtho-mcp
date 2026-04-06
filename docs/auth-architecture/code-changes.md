# Code Changes: Azure Functions MCP Binding → Express + MCP SDK

## What stays the same

All 13 tool implementations in `src/tools/*.ts` stay almost identical. The business logic
(Graph API calls, fuzzy matching, response shaping) doesn't change. Only the function
signature picks up an optional `userToken` parameter.

## What changes

### Dependencies

```diff
  "@azure/functions": "^4.9.0",
  "@azure/identity": "^4.5.0",
  "@microsoft/microsoft-graph-client": "^3.0.7"
+ "express": "^4.x",
+ "@modelcontextprotocol/sdk": "^1.x",
+ "jwks-rsa": "^3.x",
+ "jsonwebtoken": "^9.x"
```

The Azure Functions runtime and `@azure/functions` package are still used for deployment
(Azure Functions can host Express apps via the HTTP trigger). We're just changing the
MCP layer on top.

### `src/index.ts` — The biggest change

Before: Declarative `app.mcpTool()` registrations
After: Express app + MCP Server from SDK, with auth middleware

```
Before (Azure Functions native binding):
  app.mcpTool("airthoGetJob", { handler: async (_, context) => { ... } })
  app.mcpTool("airthoBrowse", { handler: async (_, context) => { ... } })
  ... × 13 tools

After (Express + MCP SDK):
  const server = new McpServer({ name: "airtho-mcp", version: "1.0.0" })
  server.tool("airtho_get_job", schema, async (args, { userToken }) => { ... })
  server.tool("airtho_browse", schema, async (args, { userToken }) => { ... })
  ... × 13 tools

  const app = express()
  app.get("/.well-known/oauth-protected-resource", metadataHandler)
  app.use("/mcp", validateJwt, mcpHandler(server))
  app.use(app.http("mcp", { handler: expressAdapter(app) }))
```

### `src/graph/client.ts` — Add per-user OBO support

```
Before:
  getGraphClient() → shared singleton (ClientSecretCredential)
  getBearerToken() → service account token

After:
  getGraphClient()                  → same singleton, used only for local dev fallback
  getGraphClientForUser(token)      → new: OBO exchange, returns per-user Graph client
  getBearerToken()                  → unchanged, local dev only
```

OBO exchange pseudocode:
```
OnBehalfOfCredential(tenantId, clientId, clientSecret, userAssertionToken)
→ returns Graph token scoped to the requesting user
→ Graph calls run as that user, SharePoint permissions apply
```

### `src/auth/` — New directory

```
src/auth/
  validate-jwt.ts     Express middleware: validates Bearer token, rejects 401 if invalid
  obo.ts              OBO token exchange: user token → Graph token via @azure/identity
  metadata.ts         RFC 9728 response: tells clients where to get tokens
```

### `src/tools/*.ts` — Minimal changes

Each tool function gains an optional `userToken` parameter:

```
Before:
  export async function getJob(args: { keyword: string }): Promise<...>

After:
  export async function getJob(args: { keyword: string }, userToken?: string): Promise<...>
```

Inside the function, the graph client call changes:

```
Before:
  const client = getGraphClient()

After:
  const client = userToken
    ? await getGraphClientForUser(userToken)   // delegated — user's permissions
    : getGraphClient()                          // fallback — service account (local dev)
```

### `host.json` — Remove MCP extension config

The `extensions.mcp` block is removed because Azure Functions is no longer acting as an
MCP server — Express handles that. Azure Functions just hosts the Express HTTP app.

```diff
  "extensions": {
    "http": {
      "routePrefix": ""
-   },
-   "mcp": {
-     "serverName": "airtho-mcp-server",
-     "serverVersion": "1.0.0",
-     "instructions": "..."
    }
  }
```

## Azure App Registration changes

- Add **delegated permissions**: `Sites.Read.All`, `Files.Read.All`, `User.Read`
- Add **redirect URI** for Claude.ai's OAuth callback
- Keep **application permissions** (for local dev client credentials fallback)
- Enable **token store** if using EasyAuth alongside Express (optional)

## Local dev impact

Local dev still works without OAuth:
- Run `func start` as before
- No Bearer token required locally
- Tools fall back to service account (client credentials)
- Set `REQUIRE_AUTH=false` env var to skip JWT validation in dev

## MCP endpoint URL change

```
Before: https://airtho-mcp.azurewebsites.net/runtime/webhooks/mcp?code=<system-key>
After:  https://airtho-mcp.azurewebsites.net/mcp
```

The `?code=` system key disappears. Auth moves to OAuth Bearer tokens instead.
The URL you register in Claude.ai Settings → Connectors changes accordingly.
