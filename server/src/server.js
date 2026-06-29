import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { getCurrentUser } from './auth.js';
import webhookRouter from './routes/webhooks.js';
import { listConnectionTypes } from './services/connectionTypes.js';
import {
  initializeConnectionStore,
  isCosmosConfigured,
} from './services/cosmosConnectionStore.js';
import {
  buildClientCredentialMetadata,
  getClientCredentials,
  saveClientCredentials,
  deleteClientCredentials,
  buildConnectionCredentialMetadata,
  getConnectionCredentials,
  saveConnectionCredentials,
  deleteConnectionCredentials,
} from './services/onePasswordService.js';
import {
  listEntities,
  getEntityById,
  createEntity,
  updateEntity,
  deleteEntity,
} from './services/entityStore.js';
import {
  isSharePointConfigured,
  browseFolder,
  debugSharePointPath,
} from './services/sharepointService.js';
import { getWorkspaceUsers } from './services/notionService.js';
import { getClientsAndCampaignsFromSharePoint } from './services/clientCampaignCsvService.js';
import { getCached, setCache } from './services/clientCampaignCache.js';
import {
  testWooCommerceConnection,
  fetchWooCommerceObjects,
  fetchWooCommerceSchema,
} from './services/wooCommerceService.js';
import { fetchGenericApiData } from './services/genericApiService.js';
import { flattenKeys, flattenRecord } from './utils/recordFlattener.js';
import { runSyncJob as executeSyncJob } from './services/syncExecutor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const frontendDistDir = path.join(rootDir, 'dist');
const frontendIndexFile = path.join(frontendDistDir, 'index.html');
const hasFrontendBuild = fs.existsSync(frontendIndexFile);

const app = express();

app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use('/webhooks', express.raw({ type: '*/*', limit: '2mb' }), webhookRouter);
app.use(express.json({ limit: '2mb' }));

if (!hasFrontendBuild) {
  app.get('/', (_req, res) => {
    res.json({
      status: 'ok',
      mode: 'local-csv',
      message: 'Ring API Pipeline local backend is running against temporary CSV files.',
    });
  });
}

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    mode: isCosmosConfigured() ? 'cosmos' : 'local-csv',
    frontend: hasFrontendBuild ? 'built' : 'not-built',
  });
});

app.get('/api/auth/me', (req, res) => {
  const user = getCurrentUser(req);
  if (!user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  return res.json(user);
});

app.get('/api/auth/is-authenticated', (req, res) => {
  const user = getCurrentUser(req);
  res.json({ authenticated: Boolean(user), user });
});

app.get('/api/connection-types', (_req, res) => {
  res.json({ data: listConnectionTypes() });
});

app.get('/api/sharepoint/browse', async (req, res) => {
  const user = getCurrentUser(req);
  if (!user) return res.status(401).json({ message: 'Authentication required' });

  if (!isSharePointConfigured()) {
    return res.status(503).json({ message: 'SharePoint is not configured on this server.' });
  }

  const { itemId } = req.query;
  try {
    const result = await browseFolder(itemId || null);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/entities/:entityName', async (req, res) => {
  const { entityName } = req.params;
  const filters = Object.fromEntries(
    Object.entries(req.query).filter(([key]) => !['sort', 'limit'].includes(key)).map(([key, value]) => [key, value]),
  );
  const sort = typeof req.query.sort === 'string' ? req.query.sort : '-created_date';
  const limit = typeof req.query.limit === 'string' ? req.query.limit : '100';

  try {
    const data = await listEntities(entityName, { filters, sort, limit });
    res.json({
      entity: entityName,
      data,
      meta: {
        source: isCosmosConfigured() ? 'cosmos' : 'local-csv',
        user: getCurrentUser(req)?.email || 'unknown',
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/entities/:entityName', async (req, res) => {
  const { entityName } = req.params;

  try {
    const created = await createEntity(entityName, req.body);
    res.status(201).json({
      entity: entityName,
      created: true,
      payload: created,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.patch('/api/entities/:entityName/:id', async (req, res) => {
  const { entityName, id } = req.params;

  try {
    const updated = await updateEntity(entityName, id, req.body);
    res.json({
      entity: entityName,
      id,
      updated: true,
      payload: updated,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete('/api/entities/:entityName/:id', async (req, res) => {
  const { entityName, id } = req.params;

  try {
    if (entityName === 'Clients') {
      const client = await getEntityById('Clients', id);
      if (client) await deleteClientCredentials(client).catch(() => {});
    }

    if (entityName === 'Connections') {
      const connection = await getEntityById('Connections', id);
      if (connection) await deleteConnectionCredentials(connection).catch(() => {});
    }

    const deleted = await deleteEntity(entityName, id);
    res.json({ entity: entityName, id, deleted: deleted.deleted });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/functions/:functionName', async (req, res) => {
  const { functionName } = req.params;

  if (functionName === 'listConnectionTypes') {
    return res.json({ connection_types: listConnectionTypes() });
  }

  if (functionName === 'saveConnectionCredentials') {
    const connectionId = req.body?.connection_id;
    const clientId = req.body?.client_id || req.body?.clientId;

    if (connectionId) {
      // New: connection-keyed credential storage
      const connection = await getEntityById('Connections', connectionId);
      if (!connection) return res.status(404).json({ message: 'Connection not found' });
      try {
        const saveResult = await saveConnectionCredentials(connection, req.body);
        const metadata = buildConnectionCredentialMetadata({ connection, payload: req.body, saveResult });
        const updatedConnection = await updateEntity('Connections', connectionId, metadata);
        return res.json({
          success: true,
          source: saveResult.source,
          connection_type: saveResult.connectionType.id,
          credential_item_id: saveResult.itemId,
          credential_field_status: saveResult.fieldStatus,
          connection: updatedConnection,
        });
      } catch (error) {
        console.error('[1Password] saveConnectionCredentials(connection) failed:', error.message);
        return res.status(400).json({ message: error.message });
      }
    }

    // Legacy: client-keyed credential storage
    const client = await getEntityById('Clients', clientId);
    if (!client) return res.status(404).json({ message: 'Client not found' });
    try {
      const saveResult = await saveClientCredentials(client, req.body);
      const metadata = buildClientCredentialMetadata({ client, payload: req.body, saveResult });
      const updatedClient = await updateEntity('Clients', clientId, metadata);
      return res.json({
        success: true,
        source: saveResult.source,
        connection_type: saveResult.connectionType.id,
        onepassword_item_id: saveResult.itemId,
        credential_field_status: saveResult.fieldStatus,
        client: updatedClient,
      });
    } catch (error) {
      console.error('[1Password] saveConnectionCredentials(client) failed:', error.message);
      return res.status(400).json({ message: error.message });
    }
  }

  if (functionName === 'testConnection' || functionName === 'testWooCommerceConnection') {
    const connectionId = req.body?.connection_id;
    const clientId = req.body?.client_id || req.body?.clientId;

    if (connectionId) {
      const connection = await getEntityById('Connections', connectionId);
      if (!connection) return res.status(404).json({ message: 'Connection not found' });
      const credentials = await getConnectionCredentials(connection);

      if (!credentials.configured) {
        return res.json({ function: functionName, success: false, source: credentials.source, connection_type: credentials.connectionType?.id, credential_field_status: credentials.fieldStatus || {}, message: credentials.message || 'Credential lookup failed.' });
      }

      // For WooCommerce: do a live API call to verify credentials work
      if (credentials.connectionType?.id === 'woocommerce') {
        try {
          const wooResult = await testWooCommerceConnection({
            ...credentials.fields,
            woo_version: connection.woo_version || 'wc/v3',
          });
          await updateEntity('Connections', connectionId, { connection_status: 'Connected' });
          return res.json({ function: functionName, success: true, source: credentials.source, connection_type: 'woocommerce', credential_field_status: credentials.fieldStatus || {}, ...wooResult });
        } catch (err) {
          await updateEntity('Connections', connectionId, { connection_status: 'Error' });
          return res.json({ function: functionName, success: false, source: credentials.source, connection_type: 'woocommerce', credential_field_status: credentials.fieldStatus || {}, message: err.message });
        }
      }

      // For other connection types: credential presence is sufficient
      return res.json({ function: functionName, success: true, source: credentials.source, connection_type: credentials.connectionType?.id, credential_field_status: credentials.fieldStatus || {}, message: 'Credentials found in vault.' });
    }

    // Legacy: client-level lookup
    const client = await getEntityById('Clients', clientId);
    if (!client) return res.status(404).json({ message: 'Client not found' });
    const credentials = await getClientCredentials(client);
    return res.json({
      function: functionName,
      success: credentials.configured,
      status_code: credentials.configured ? 200 : 404,
      source: credentials.source,
      connection_type: credentials.connectionType?.id,
      credential_field_status: credentials.fieldStatus || {},
      message: credentials.configured ? 'Credential lookup succeeded.' : credentials.message || 'Credential lookup failed.',
    });
  }

  if (functionName === 'fetchWooCommerceObjects') {
    const connectionId = req.body?.connection_id || req.body?.client_id;
    try {
      const connection = await getEntityById('Connections', connectionId);
      if (!connection) return res.status(404).json({ message: 'Connection not found' });
      const credentials = await getConnectionCredentials(connection);
      if (!credentials.configured) return res.status(400).json({ message: `Credentials not configured: ${credentials.message}` });
      const objects = await fetchWooCommerceObjects({ ...credentials.fields, woo_version: connection.woo_version || 'wc/v3' });
      return res.json({ objects });
    } catch (err) {
      return res.status(502).json({ message: err.message });
    }
  }

  if (functionName === 'fetchWooCommerceSchema') {
    const connectionId = req.body?.connection_id || req.body?.client_id;
    const endpoint = req.body?.woo_page || req.body?.endpoint || 'orders';
    const includeSample = Boolean(req.body?.include_sample);
    // Build optional date filter from request body (same shape as syncJob date filter)
    let dateAfter, dateBefore;
    const dfType = req.body?.date_filter_type;
    if (dfType === 'relative') {
      const days = Number(req.body?.date_filter_relative_days) || 30;
      dateAfter = new Date(Date.now() - days * 86_400_000).toISOString();
    } else if (dfType === 'absolute') {
      if (req.body?.date_filter_start) dateAfter = new Date(req.body.date_filter_start).toISOString();
      if (req.body?.date_filter_end) dateBefore = new Date(req.body.date_filter_end).toISOString();
    }
    try {
      const connection = await getEntityById('Connections', connectionId);
      if (!connection) return res.status(404).json({ message: 'Connection not found' });
      const credentials = await getConnectionCredentials(connection);
      if (!credentials.configured) return res.status(400).json({ message: `Credentials not configured: ${credentials.message}` });
      const schema = await fetchWooCommerceSchema(
        { ...credentials.fields, woo_version: connection.woo_version || 'wc/v3' },
        endpoint,
        { includeSample, dateAfter, dateBefore },
      );
      return res.json(schema);
    } catch (err) {
      return res.status(502).json({ message: err.message });
    }
  }

  // Unified schema fetch — routes by connection type.
  // Returns { fields, flat_records, array_source_fields } for any outbound connector.
  if (functionName === 'fetchSchema') {
    const connectionId = req.body?.connection_id || req.body?.client_id;
    let dateAfter, dateBefore;
    const dfType = req.body?.date_filter_type;
    if (dfType === 'relative') {
      const days = Number(req.body?.date_filter_relative_days) || 30;
      dateAfter = new Date(Date.now() - days * 86_400_000).toISOString();
    } else if (dfType === 'absolute') {
      if (req.body?.date_filter_start) dateAfter = new Date(req.body.date_filter_start).toISOString();
      if (req.body?.date_filter_end) dateBefore = new Date(req.body.date_filter_end).toISOString();
    }
    try {
      const connection = connectionId ? await getEntityById('Connections', connectionId) : null;
      if (!connection) return res.status(404).json({ message: 'Connection not found' });
      const credentials = await getConnectionCredentials(connection);
      if (!credentials.configured) return res.status(400).json({ message: `Credentials not configured: ${credentials.message}` });
      const connectionType = credentials.connectionType?.id || connection.connection_type;

      if (connectionType === 'woocommerce') {
        // Delegate to existing WooCommerce schema fetcher (already uses shared flattener)
        const endpoint = req.body?.woo_page || 'orders';
        const schema = await fetchWooCommerceSchema(
          { ...credentials.fields, woo_version: connection.woo_version || 'wc/v3' },
          endpoint,
          { includeSample: true, dateAfter, dateBefore },
        );
        return res.json(schema);
      }

      if (connectionType === 'generic_api_key' || connectionType === 'generic_oauth2') {
        const endpoint = req.body?.api_endpoint || credentials.fields?.api_base_url;
        if (!endpoint) {
          return res.json({ fields: [], flat_records: [], array_source_fields: [], message: 'No API endpoint configured. Set one in the pipeline API Configuration section.' });
        }
        const syncJobLike = {
          api_endpoint: endpoint,
          api_auth_type: req.body?.api_auth_type || 'Bearer Token',
          api_auth_header_name: req.body?.api_auth_header_name || '',
          api_method: req.body?.api_method || 'GET',
          api_request_body: req.body?.api_request_body || '',
        };
        const rawRecords = await fetchGenericApiData(credentials.fields, syncJobLike);
        if (!rawRecords.length) {
          return res.json({ fields: [], flat_records: [], array_source_fields: [], message: 'No records returned from API' });
        }
        const sampleRecords = rawRecords.slice(0, 10);
        const fields = flattenKeys(rawRecords[0]);
        const flat_records = sampleRecords.map((r) => flattenRecord(r));
        const array_source_fields = Object.entries(rawRecords[0] || {})
          .filter(([, v]) => Array.isArray(v))
          .map(([k]) => k);
        return res.json({
          fields, flat_records, array_source_fields,
          message: `Schema derived from ${sampleRecords.length} live records`,
        });
      }

      return res.json({ fields: [], flat_records: [], array_source_fields: [], message: `Field browsing is not supported for connection type "${connectionType}"` });
    } catch (err) {
      return res.status(502).json({ message: err.message });
    }
  }

  if (functionName === 'runSyncJob') {
    const syncJobId = req.body?.sync_job_id;
    const connectionId = req.body?.connection_id;
    if (!syncJobId) return res.json({ success: false, message: 'sync_job_id is required' });
    // executeSyncJob never throws — always returns { success: true, ... } or { success: false, message }
    const result = await executeSyncJob(syncJobId, connectionId).catch((err) => ({ success: false, message: err.message }));
    return res.json(result);
  }

  if (functionName === 'getNotionUsers') {
    try {
      const users = await getWorkspaceUsers();
      return res.json({ users });
    } catch (error) {
      return res.status(502).json({ message: error.message });
    }
  }

  if (functionName === 'getClientsAndCampaigns') {
    try {
      const { data: cached, stale } = await getCached();
      if (cached && !stale) {
        return res.json({ clients: cached.clients, campaigns: cached.campaigns, cached: true });
      }
      if (cached && stale) {
        // Return stale data immediately; refresh from SharePoint CSV in background
        res.json({ clients: cached.clients, campaigns: cached.campaigns, cached: true, stale: true });
        getClientsAndCampaignsFromSharePoint()
          .then(({ clients, campaigns }) => setCache(clients, campaigns))
          .catch((err) => console.error('[Cache] Background refresh failed:', err.message));
        return;
      }
      // No cache — fetch from SharePoint synchronously, then store
      const { clients, campaigns } = await getClientsAndCampaignsFromSharePoint();
      setCache(clients, campaigns).catch(() => {});
      return res.json({ clients, campaigns, cached: false });
    } catch (error) {
      return res.status(502).json({ message: error.message });
    }
  }

  if (functionName === 'refreshClientCampaignCache') {
    // Force-reads the SharePoint CSV and updates the Cosmos cache regardless of TTL.
    try {
      const { clients, campaigns } = await getClientsAndCampaignsFromSharePoint();
      await setCache(clients, campaigns);
      return res.json({ ok: true, clients: clients.length, campaigns: Object.keys(campaigns).length });
    } catch (error) {
      return res.status(502).json({ message: error.message });
    }
  }

  if (functionName === 'debugSharePointCsv') {
    try {
      const result = await debugSharePointPath('Notion_Client_Campaign_Active_Index');
      return res.json(result);
    } catch (error) {
      return res.status(502).json({ message: error.message });
    }
  }

  if (functionName === 'previewApiData') {
    const connectionId = req.body?.connection_id || req.body?.client_id;
    const endpoint = req.body?.woo_page || req.body?.endpoint || 'orders';
    try {
      const connection = connectionId ? await getEntityById('Connections', connectionId) : null;
      if (!connection) return res.json({ ok: true, preview: [], message: 'No connection specified' });
      const credentials = await getConnectionCredentials(connection);
      if (!credentials.configured) return res.json({ ok: false, preview: [], message: credentials.message });
      const connectionType = credentials.connectionType?.id || connection.connection_type;
      let preview = [];
      if (connectionType === 'woocommerce') {
        const { fetchWooCommerceData: fetchWoo } = await import('./services/wooCommerceService.js');
        const rows = await fetchWoo({ ...credentials.fields, woo_version: connection.woo_version || 'wc/v3' }, endpoint, { maxRecords: 5 });
        preview = rows.slice(0, 5);
      } else {
        const { fetchGenericApiData } = await import('./services/genericApiService.js');
        const rows = await fetchGenericApiData(credentials.fields, req.body);
        preview = rows.slice(0, 5);
      }
      return res.json({ ok: true, preview });
    } catch (err) {
      return res.status(502).json({ ok: false, preview: [], message: err.message });
    }
  }

  res.json({ function: functionName, ok: true, payload: req.body });
});

app.post('/api/app-logs', (_req, res) => {
  res.status(201).json({ ok: true });
});

if (hasFrontendBuild) {
  app.use(express.static(frontendDistDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/webhooks/')) {
      return next();
    }

    return res.sendFile(frontendIndexFile);
  });
}

const start = async () => {
  app.listen(config.port, () => {
    const storeMode = isCosmosConfigured() ? 'cosmos' : 'local-csv';
    console.log(`Backend listening on http://localhost:${config.port} [entity-store=${storeMode}]`);

    if (!isCosmosConfigured()) {
      console.warn('AZURE_COSMOS_CONNECTIONSTRING is not set; entity storage falls back to local CSV and /webhooks/:clientName will return 503.');
      return;
    }

    initializeConnectionStore()
      .then(() => {
        console.log(`Cosmos connection store ready: ${config.cosmosDatabaseName}.${config.cosmosConnectionsCollection}`);
      })
      .catch((error) => {
        console.error('Cosmos connection store initialization failed:', error);
      });
  });
};

start().catch((error) => {
  console.error('Backend failed to start:', error);
  process.exit(1);
});
