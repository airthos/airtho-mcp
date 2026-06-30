# SharePoint File Transfer MCP Agent Instructions

Use these instructions to connect any MCP-capable agent builder to this SharePoint file-transfer MCP server.

## MCP Server

Production MCP endpoint:

```text
https://<function-app>.azurewebsites.net/mcp
```

Local development endpoint:

```text
http://localhost:7071/mcp
```

Do not use a static API key. This MCP server uses OAuth. The agent builder should discover and complete OAuth through the server metadata.

OAuth metadata endpoints:

```text
https://<function-app>.azurewebsites.net/.well-known/oauth-protected-resource
https://<function-app>.azurewebsites.net/.well-known/oauth-authorization-server
```

After OAuth succeeds, call the MCP endpoint with:

```text
Authorization: Bearer <access token>
```

## Authentication Requirements

The user must sign in with a Microsoft Entra account that has SharePoint access to the target site and document library.

The Entra app registration used by the MCP server must have these Microsoft Graph delegated permissions with tenant admin consent:

```text
Sites.ReadWrite.All
User.Read
```

The app registration must expose this API scope:

```text
api://<CLIENT_ID>/mcp.access
```

Production redirect URI:

```text
https://<function-app>.azurewebsites.net/callback
```

Local testing redirect URI:

```text
http://localhost:7071/callback
```

## Available Tools

The server exposes exactly two tools after authentication.

```text
airtho_download_sharepoint_file
airtho_upload_sharepoint_file
```

## Tool: `airtho_upload_sharepoint_file`

Uploads base64 file bytes to a SharePoint document library directory.

If a file with the same name already exists, Microsoft Graph replaces it.

Simple uploads are limited to 250 MB.

Input schema:

```json
{
  "site_url": "https://<tenant>.sharepoint.com/sites/<site-name>",
  "drive_name": "Documents",
  "directory_path": "",
  "filename": "test.txt",
  "content_base64": "QWlydGhvIE1DUCBsb2NhbCB1cGxvYWQgdGVzdAo=",
  "content_type": "text/plain"
}
```

Fields:

```text
site_url        SharePoint site URL. Optional if the server has a default site configured.
drive_name      SharePoint document library name, for example Documents.
directory_path  Destination folder path inside the library. Use an empty string for root.
filename        Destination file name.
content_base64  Base64-encoded file bytes.
content_type    Optional MIME type.
```

Successful response shape:

```json
{
  "drive_name": "Documents",
  "path": "test.txt",
  "item_id": "01...",
  "name": "test.txt",
  "size": 29,
  "mime_type": "text/plain",
  "web_url": "https://<tenant>.sharepoint.com/sites/<site-name>/Shared%20Documents/test.txt"
}
```

## Tool: `airtho_download_sharepoint_file`

Downloads a SharePoint file and returns base64 file bytes.

Input by path:

```json
{
  "site_url": "https://<tenant>.sharepoint.com/sites/<site-name>",
  "drive_name": "Documents",
  "path": "test.txt"
}
```

Input by item ID:

```json
{
  "site_url": "https://<tenant>.sharepoint.com/sites/<site-name>",
  "drive_name": "Documents",
  "item_id": "01..."
}
```

Fields:

```text
site_url    SharePoint site URL. Optional if the server has a default site configured.
drive_name  SharePoint document library name, for example Documents.
path        File path inside the library. Prefer this when known.
item_id     Graph driveItem ID. Use when path is unavailable.
```

Successful response shape:

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

To reconstruct the downloaded file, base64-decode `content_base64`.

## Error Shape

Tool errors are returned as JSON text with this shape:

```json
{
  "error": "error_code",
  "message": "Human readable detail"
}
```

Common errors:

```text
auth_required      The agent did not authenticate before calling a tool.
drive_not_found    The requested document library was not found.
site_not_found     The requested SharePoint site URL could not be resolved.
not_found          The requested file or folder was not found.
not_a_file         The requested download target is a folder.
file_too_large     Upload is larger than the 250 MB simple upload limit.
graph_error        Microsoft Graph returned an error.
```

## Minimal End To End Test

1. Authenticate through OAuth.
2. List tools and confirm only these are visible:

```text
airtho_download_sharepoint_file
airtho_upload_sharepoint_file
```

3. Upload `test.txt`:

```json
{
  "site_url": "https://<tenant>.sharepoint.com/sites/<site-name>",
  "drive_name": "Documents",
  "directory_path": "",
  "filename": "test.txt",
  "content_base64": "QWlydGhvIE1DUCBsb2NhbCB1cGxvYWQgdGVzdAo=",
  "content_type": "text/plain"
}
```

4. Download `test.txt`:

```json
{
  "site_url": "https://<tenant>.sharepoint.com/sites/<site-name>",
  "drive_name": "Documents",
  "path": "test.txt"
}
```

5. Base64-decode the returned `content_base64` and confirm it matches:

```text
Airtho MCP local upload test
```

## Notes For Agents

- Always authenticate before calling tools.
- Always provide `site_url` when the target site is known.
- Use `drive_name: "Documents"` for the default SharePoint document library unless the user specifies a different library.
- Preserve binary files by treating content as bytes, not text, before base64 encoding or after base64 decoding.
- Do not invent SharePoint permissions. If Graph returns `403`, tell the user the signed-in account likely lacks access to that site or library.
