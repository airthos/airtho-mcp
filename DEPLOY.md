# Airtho MCP — Deployment Guide

## Prerequisites

- Azure CLI (`az`) installed and logged in
- Docker installed (for building the container image)
- An Azure Container Registry (ACR) or use Docker Hub
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

## 3. Build and Push the Container

```bash
# Build
docker build -t airtho-mcp:latest .

# Tag and push to Azure Container Registry
az acr login --name <your-acr-name>
docker tag airtho-mcp:latest <your-acr-name>.azurecr.io/airtho-mcp:latest
docker push <your-acr-name>.azurecr.io/airtho-mcp:latest
```

---

## 4. Deploy to Azure Container Apps

```bash
az containerapp create \
  --name airtho-mcp \
  --resource-group <your-resource-group> \
  --environment <your-container-app-env> \
  --image <your-acr-name>.azurecr.io/airtho-mcp:latest \
  --target-port 3000 \
  --ingress external \
  --env-vars \
    TENANT_ID=<tenant-id> \
    CLIENT_ID=<client-id> \
    CLIENT_SECRET=secretref:<key-vault-secret-or-direct> \
    DEFAULT_SITE_ID=<site-id>
```

For production, store `CLIENT_SECRET` in **Azure Key Vault** and reference it via a Container Apps secret rather than a plain env var.

---

## 5. Register the MCP Endpoint in Claude

Once deployed, your MCP endpoint URL will be:

```
https://<container-app-name>.<region>.azurecontainerapps.io/mcp
```

Add this URL to Claude's MCP connector settings.

---

## Local Development

```bash
cp .env.example .env
# Fill in real values in .env

npm install
npm run build
npm start
```

Server runs at `http://localhost:3000/mcp`.
