# Local temporary backend

This backend can run locally without Azure for development.

## Run locally

```bash
cd server
npm install
npm run dev
```

## Local data

Metadata is stored in CSV files under `server/data/`.

## 1Password Connect

To enable real 1Password lookups, create a `.env` file in the `server` folder with the same setting names used by Azure App Service:

```env
OP_CONNECT_HOST=https://your-connect-host
OP_CONNECT_TOKEN=your-token
OP_CONNECT_DEFAULT_VAULT_ID=your-default-vault-uuid
```

Then restart the backend.

The older local names `ONEPASSWORD_CONNECT_URL`, `ONEPASSWORD_TOKEN`, and `ONEPASSWORD_VAULT_UUID` are still supported as aliases.

## Azure Cosmos DB Mongo API

Webhook connection metadata is read from Cosmos DB through the Mongo API. Configure:

```env
AZURE_COSMOS_CONNECTIONSTRING=your-cosmos-mongo-connection-string
COSMOS_DATABASE_ID=ring-pipeline
COSMOS_CONNECTIONS_COLLECTION=connections
```

The webhook route looks up documents by `clientName`:

```json
{
  "clientName": "example-client",
  "name": "Example Client",
  "direction": "inbound",
  "vaultId": "1password-vault-id",
  "vaultItemId": "1password-item-id",
  "status": "active",
  "createdBy": "user@ring.digital",
  "createdAt": "2026-06-26T00:00:00.000Z",
  "updatedAt": "2026-06-26T00:00:00.000Z"
}
```

`clientName` should be URL-safe, lowercase, 2-63 characters, and use only letters, numbers, and hyphens.

## Webhooks

Inbound webhooks are served at:

```text
POST /webhooks/:clientName
```

The route fetches the signing secret from the referenced 1Password item, verifies an HMAC SHA-256 signature over the raw request body, and only then accepts the JSON payload. By default it reads the signature from `x-signature` and the 1Password field named `webhook_secret`; override those with `WEBHOOK_SIGNATURE_HEADER` and `WEBHOOK_SECRET_FIELD`.

## Connection credential mappings

Credential fields are defined in `src/services/connectionTypes.js`. The frontend asks the backend for those mappings with the `listConnectionTypes` function, then saves values with `saveConnectionCredentials`.

The `Clients` CSV should only store metadata such as:

- `connection_type`
- `onepassword_item_id`
- `onepassword_vault_uuid`
- `credential_field_status`
- non-secret connection fields like `api_base_url`

Secret values such as `api_key`, `access_token`, `woo_consumer_key`, and `woo_consumer_secret` should only be stored in 1Password. Local development falls back to `server/data/credentials.json`, which is ignored by Git.

To add a new integration type, add an entry to `CONNECTION_TYPES` with its required `fields`. For example, WooCommerce uses `woo_login_url`, `woo_consumer_key`, and `woo_consumer_secret`.
