# Airtho MCP — Deployment Guide (Azure Functions)

## Prerequisites

- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) installed and logged in
- [Azure Functions Core Tools v4](https://learn.microsoft.com/en-us/azure/azure-functions/functions-run-local) installed (`npm install -g azure-functions-core-tools@4`)
- Node.js 18+
- M365 admin access (for App Registration consent)

---

## 1. Azure App Registration

In the Azure Portal (or via CLI), register an app in your AAD tenant:

```bash
az ad app create --display-name "airtho-mcp"
```

Note the `appId` (CLIENT_ID) and `tenantId` (TENANT_ID).

Create a client secret:

```bash
az ad app credential reset --id <CLIENT_ID> --append
```

Grant API permissions (`Files.Read.All` + `Sites.Read.All`) and have an M365 admin grant **admin consent**.

---

## 2. Discover Your SharePoint Site ID

Once the app registration has consent, resolve the Airtho site ID via Graph API:

```bash
curl -H "Authorization: Bearer <token>" \
  "https://graph.microsoft.com/v1.0/sites/airtho.sharepoint.com:/sites/Airtho"
```

The `id` field in the response is the site ID — it looks like `airtho.sharepoint.com,<guid>,<guid>`. Record it as `DEFAULT_SITE_ID`.

---

## 3. Create the Azure Function App

```bash
# Create a resource group (skip if you have one)
az group create --name airtho-rg --location australiaeast

# Create a storage account (required by Functions runtime)
az storage account create \
  --name airthomcpstorage \
  --location australiaeast \
  --resource-group airtho-rg \
  --sku Standard_LRS

# Create the Function App (Node.js 20, Linux)
az functionapp create \
  --resource-group airtho-rg \
  --consumption-plan-location australiaeast \
  --runtime node \
  --runtime-version 20 \
  --functions-version 4 \
  --name airtho-mcp \
  --storage-account airthomcpstorage \
  --os-type Linux
```

---

## 4. Configure App Settings (Secrets)

```bash
az functionapp config appsettings set \
  --name airtho-mcp \
  --resource-group airtho-rg \
  --settings \
    TENANT_ID=<tenant-id> \
    CLIENT_ID=<client-id> \
    CLIENT_SECRET=<client-secret> \
    DEFAULT_SITE_ID=<site-id>
```

For production, store `CLIENT_SECRET` in **Azure Key Vault** and reference it as a Key Vault reference:

```
@Microsoft.KeyVault(SecretUri=https://<vault-name>.vault.azure.net/secrets/<secret-name>/)
```

---

## 5. Build and Deploy

```bash
npm install
npm run build

# Deploy via Core Tools (publishes dist/ + package.json to Azure)
func azure functionapp publish airtho-mcp --node
```

Your MCP endpoint will be:

```
https://airtho-mcp.azurewebsites.net/api/mcp
```

---

## 6. Register the MCP Endpoint in Claude

Add the URL above to Claude's MCP connector settings.

---

## Local Development

### One-time setup

```bash
npm install

# Copy the example settings and fill in your real values
cp local.settings.json.example local.settings.json
# Edit local.settings.json — add TENANT_ID, CLIENT_ID, CLIENT_SECRET, DEFAULT_SITE_ID
```

`local.settings.json` is gitignored and never committed.

### Run locally

```bash
npm start
# or: func start (after npm run build)
```

The MCP endpoint will be available at:

```
http://localhost:7071/api/mcp
```

### Azurite (local storage emulator)

`AzureWebJobsStorage` in `local.settings.json` is set to `UseDevelopmentStorage=true`, which requires [Azurite](https://learn.microsoft.com/en-us/azure/storage/common/storage-use-azurite):

```bash
npm install -g azurite
azurite --silent --location /tmp/azurite &
```

Alternatively, replace `UseDevelopmentStorage=true` with a real Azure Storage connection string to skip Azurite entirely.
