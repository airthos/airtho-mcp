# Airtho MCP Server Agent Builder Reference

## What This Server Does

This MCP server gives an authenticated agent two SharePoint file-transfer tools:

- `airtho_download_sharepoint_file`
- `airtho_upload_sharepoint_file`

The server runs on Azure Functions and uses MCP Streamable HTTP at:

```text
https://<function-app>.azurewebsites.net/mcp
```

Local development uses:

```text
http://localhost:7071/mcp
```

Each user signs in with Microsoft Entra ID. Tool calls run through Microsoft Graph as the signed-in user, so normal SharePoint permissions still apply.

## Tool List

### `airtho_download_sharepoint_file`

Downloads a SharePoint file and returns base64 file bytes.

Input:

```json
{
  "site_url": "https://airtho.sharepoint.com/sites/IT",
  "drive_name": "Documents",
  "path": "test.txt"
}
```

Alternative input by Graph driveItem ID:

```json
{
  "site_url": "https://airtho.sharepoint.com/sites/IT",
  "drive_name": "Documents",
  "item_id": "01..."
}
```

Output:

```json
{
  "drive_name": "Documents",
  "path": "test.txt",
  "item_id": "01...",
  "name": "test.txt",
  "size": 29,
  "mime_type": "text/plain",
  "content_base64": "QWlydGhvIE1DUCBsb2NhbCB1cGxvYWQgdGVzdAo="
}
```

### `airtho_upload_sharepoint_file`

Uploads base64 file bytes to a SharePoint document library directory. If the destination file already exists, Graph replaces it.

Input:

```json
{
  "site_url": "https://airtho.sharepoint.com/sites/IT",
  "drive_name": "Documents",
  "directory_path": "",
  "filename": "test.txt",
  "content_base64": "QWlydGhvIE1DUCBsb2NhbCB1cGxvYWQgdGVzdAo=",
  "content_type": "text/plain"
}
```

Output:

```json
{
  "drive_name": "Documents",
  "path": "test.txt",
  "item_id": "01...",
  "name": "test.txt",
  "size": 29,
  "mime_type": "text/plain",
  "web_url": "https://airtho.sharepoint.com/sites/it/Shared%20Documents/test.txt"
}
```

Uploads use Microsoft Graph simple upload, so files over 250 MB are rejected with `file_too_large`.

## How To Configure An Agent Builder

Use the MCP server URL:

```text
https://<function-app>.azurewebsites.net/mcp
```

Authentication should use the server's advertised OAuth metadata:

```text
https://<function-app>.azurewebsites.net/.well-known/oauth-protected-resource
https://<function-app>.azurewebsites.net/.well-known/oauth-authorization-server
```

The agent builder should not send a static API key. It should complete OAuth and then call `/mcp` with:

```text
Authorization: Bearer <access token>
```

The MCP server supports dynamic client registration at:

```text
POST https://<function-app>.azurewebsites.net/register
```

## Required Entra App Registration Settings

Microsoft Graph delegated permissions:

- `Sites.ReadWrite.All`
- `User.Read`

Admin consent must be granted for the tenant.

Redirect URI:

```text
https://<function-app>.azurewebsites.net/callback
```

For local testing, also add:

```text
http://localhost:7071/callback
```

Expose an API scope:

```text
api://<CLIENT_ID>/mcp.access
```

## Required App Settings

Set these in Azure Function App configuration:

```text
TENANT_ID=<entra-tenant-id>
CLIENT_ID=<app-registration-client-id>
CLIENT_SECRET=<app-registration-client-secret>
MCP_RESOURCE_URI=https://<function-app>.azurewebsites.net
REQUIRE_AUTH=true
```

Optional fallback site:

```text
DEFAULT_SITE_ID=airtho.sharepoint.com,<site-guid>,<web-guid>
```

The tools can target a specific SharePoint site with `site_url`, so `DEFAULT_SITE_ID` is only a fallback.

## Local Validation

```bash
npm install
npm test -- --runInBand
npm run build
func start
```

Local endpoint:

```text
http://localhost:7071/mcp
```

Local credentials go in `local.settings.json`. Do not commit that file.

## Security Notes

- `local.settings.json` and `.env` are ignored and must never be committed.
- The server returns binary file content as base64 in JSON text responses.
- Tool access is delegated. The signed-in user must have SharePoint access to the target site and library.
- App-only SharePoint permissions are not required for the current tool flow.
