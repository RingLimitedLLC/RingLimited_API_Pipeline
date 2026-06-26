# Internal migration plan for Ring API Pipeline

## Current migration review

- Frontend stack confirmed: React 18, Vite, Tailwind, Radix/shadcn-style UI components, TanStack Query, and the exported Base44 compatibility client.
- Current backend scaffold: Express under `server/src`, using ES modules. The Azure handoff in `handoff/` is CommonJS, so backend migration code should be translated into the existing ES module style unless the server is deliberately converted later.
- Base44 credential risk areas:
  - `base44/entities/Clients.jsonc` includes credential-shaped fields such as `api_key`, `access_token`, `refresh_token`, `webhook_secret`, WooCommerce keys, and inbound API keys.
  - `base44/entities/SyncJobs.jsonc` includes `api_auth_value`, which is a raw token/key field.
  - Base44 functions such as WooCommerce schema/object fetches read credentials from Base44 entity records. Those implementations should be treated as reference logic only; production code should fetch secrets server-side from 1Password.
  - Several frontend components generate, display, copy, or prefill inbound/API keys (`InboundPushManager`, `CampaignsManager`, `InboundPushConfig`, `SyncJobDialog`). Those flows need server-owned secret generation and metadata-only responses before production use.
- `src/api/base44Client.js` still imports `@base44/sdk` and can call Base44 outside local internal-API mode. During the port, the UI should move to internal `/api/*` endpoints only, then the Base44 SDK dependency can be removed.

## Proposed merged app structure

```text
src/
  api/
    internalApiClient.js          # Browser calls only this app's /api/* routes
    base44Client.js               # Temporary compatibility shim; remove after port
  components/, pages/, lib/       # Preserve UI/UX while rewiring data access

server/
  src/
    server.js                     # Express entry point, Easy Auth-aware /api routes, raw /webhooks
    auth.js                       # Local dev helpers and Easy Auth principal parsing as needed
    config.js                     # Azure App Service + local env settings
    routes/
      webhooks.js                 # POST /webhooks/:clientName, HMAC verified per connection
      connections.js              # Next phase: /api/connections CRUD
    services/
      cosmosConnectionStore.js    # Cosmos DB Mongo API metadata store
      onePasswordService.js       # 1Password Connect reads/writes; no browser exposure
      auditLogStore.js            # Next phase: secret access audit collection
      connectionTypes.js          # Field definitions and metadata sanitization
      csvStore.js                 # Temporary local/dev compatibility only
  data/                           # Local CSV/mock data, not production storage

base44/                           # Exported reference only; do not deploy
handoff/                          # Azure/Claude handoff reference only
```

## 1. Target architecture

- Frontend: React/Vite app hosted on a static platform or containerized web host.
- Backend API: small internal service that exposes:
  - /api/auth/me
  - /api/auth/is-authenticated
  - /api/entities/:entity
  - /api/functions/:functionName
- Identity: Microsoft Entra ID (formerly Azure AD) with MFA enforced.
- Secrets: client API credentials stored in 1Password, retrieved by the backend at runtime via the 1Password Connect API or an internal integration.
- Metadata store: Azure SQL Database or PostgreSQL Flexible Server for non-sensitive metadata such as clients, campaigns, sync jobs, logs, and mappings.
- Sensitive data: only the backend should see raw credentials; the frontend should never receive them directly.

## 2. Recommended implementation phases

### Phase 1 - Introduce a backend abstraction
- Keep the current React UI intact.
- Add a compatibility layer so existing Base44 calls can be routed to a custom backend endpoint.
- Start by replacing the auth and entity CRUD calls first.

### Phase 2 - Stand up the backend service
- Build a lightweight Node/TypeScript API service.
- Add Microsoft Entra authentication middleware.
- Connect the backend to Azure SQL/Postgres.
- Add 1Password secret retrieval for client credentials.

### Phase 3 - Move data and secrets ownership
- Store metadata in Azure.
- Store per-client credentials in 1Password with access restrictions.
- Ensure the backend fetches credentials on demand and never returns them to the frontend.

### Phase 4 - Production hosting
- Host the frontend and backend at pipeline.ring.digital.
- Protect the app with Entra ID and MFA.
- Use HTTPS, managed certificates, and a reverse proxy or platform-managed ingress.

## 3. External setup checklist

### 1Password
1. Create a dedicated vault for Ring API integration secrets.
2. Create a service account or automation account with access to that vault.
3. Create an item per client containing only the necessary fields, such as:
   - api_url
   - username
   - password
   - token
   - api_key
4. Restrict access to the minimum set of users or service accounts.
5. Configure 1Password Connect or a secure automation runner to retrieve these values.

### Azure
1. Create or select an Azure subscription and resource group.
2. Provision Azure SQL Database or Azure Database for PostgreSQL.
3. Create a database and schema for the app.
4. Create an Azure AD app registration for the backend.
5. Grant the backend app permissions to Microsoft Graph or other needed APIs.
6. Store database credentials in Azure Key Vault, not in source control.

### Microsoft Entra / access control
1. Create an Entra app registration for the web app.
2. Configure redirect URIs for the frontend and backend.
3. Enable MFA and conditional access for the target users.
4. Restrict access to the organization and required security groups.
5. Optionally enable single sign-on for the hosted app.

## 4. Hosting at pipeline.ring.digital

### Option A - Static frontend + separate backend
- Frontend: Vercel, Netlify, Azure Static Web Apps, or Azure App Service.
- Backend: Azure Container Apps, Azure App Service, or a managed Kubernetes service.
- DNS: no longer the selected path; `pipeline.ring.digital` is bound directly to the Azure App Service monolith.

### Option B - Single container / monolith
- Host both frontend and backend behind one reverse proxy.
- Best for an initial internal deployment if you want to move faster.

### Recommended production setup
- Current selected path: one Azure App Service hosts both the Express backend and the built Vite frontend at `pipeline.ring.digital`.
- Keep using Easy Auth on the App Service for all management screens and `/api/*` routes.
- Keep `/webhooks/*` excluded from Easy Auth and verify each inbound webhook with per-connection HMAC secrets from 1Password.

## 5. Suggested first backend endpoints

- POST /api/auth/login
- GET /api/auth/me
- GET /api/auth/is-authenticated
- GET /api/entities/clients
- POST /api/entities/clients
- PATCH /api/entities/clients/:id
- GET /api/entities/sync_logs
- POST /api/functions/listConnectionTypes
- POST /api/functions/saveConnectionCredentials
- POST /api/functions/testConnection
- POST /api/functions/previewApiData

## 6. Security rules

- Never send raw client credentials to the frontend.
- Store only metadata in the database.
- Use service-to-service authentication between the app and 1Password.
- Rotate secrets regularly.
- Log access attempts and audit secret retrievals.
- Keep the backend responsible for all outbound API calls to client systems.
