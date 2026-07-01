import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const trimUrl = (value = '') => String(value).trim().replace(/\/+$/, '');

export const config = {
  port: Number(process.env.PORT || 3001),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  authMode: process.env.AUTH_MODE || 'mock',
  onePasswordConnectUrl: trimUrl(process.env.OP_CONNECT_HOST || process.env.ONEPASSWORD_CONNECT_URL || ''),
  onePasswordToken: process.env.OP_CONNECT_TOKEN || process.env.ONEPASSWORD_TOKEN || '',
  onePasswordVaultUuid: process.env.OP_CONNECT_DEFAULT_VAULT_ID || process.env.ONEPASSWORD_VAULT_UUID || '',
  azureDbConnectionString: process.env.AZURE_DB_CONNECTION_STRING || process.env.AZURE_COSMOS_CONNECTIONSTRING || '',
  cosmosConnectionString: process.env.AZURE_COSMOS_CONNECTIONSTRING || process.env.AZURE_DB_CONNECTION_STRING || '',
  cosmosDatabaseName: process.env.COSMOS_DATABASE_ID || process.env.COSMOS_DATABASE_NAME || 'ring-pipeline',
  cosmosConnectionsCollection: process.env.COSMOS_CONNECTIONS_COLLECTION || 'connections',
  webhookSignatureHeader: process.env.WEBHOOK_SIGNATURE_HEADER || 'x-signature',
  webhookSecretField: process.env.WEBHOOK_SECRET_FIELD || 'webhook_secret',
  entraTenantId: process.env.ENTRA_TENANT_ID || '',
  entraClientId: process.env.ENTRA_CLIENT_ID || '',
  entraRequiredGroup: process.env.ENTRA_REQUIRED_GROUP || '',
  sharepointTenantId: process.env.SHAREPOINT_TENANT_ID || '',
  sharepointClientId: process.env.SHAREPOINT_CLIENT_ID || '',
  sharepointClientSecret: process.env.SHAREPOINT_CLIENT_SECRET || '',
  sharepointSiteUrl: process.env.SHAREPOINT_SITE_URL || '',
  notionIntegrationToken: process.env.NOTION_INTEGRATION_TOKEN || '',
  azureSqlConnectionString: process.env.AZURE_SQL_CONNECTION_STRING || '',
};
