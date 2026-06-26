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
} from './services/onePasswordService.js';
import {
  listEntities,
  getEntityById,
  createEntity,
  updateEntity,
  deleteEntity,
} from './services/csvStore.js';

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
    mode: 'local-csv',
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
        source: 'local-csv',
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
    const clientId = req.body?.client_id || req.body?.clientId;
    const client = await getEntityById('Clients', clientId);
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }

    try {
      const saveResult = await saveClientCredentials(client, req.body);
      const metadata = buildClientCredentialMetadata({
        client,
        payload: req.body,
        saveResult,
      });
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
      return res.status(400).json({ message: error.message });
    }
  }

  if (functionName === 'testConnection' || functionName === 'testWooCommerceConnection') {
    const clientId = req.body?.client_id || req.body?.clientId;
    const client = await getEntityById('Clients', clientId);
    if (!client) {
      return res.status(404).json({ message: 'Client not found' });
    }

    const credentials = await getClientCredentials(client);
    return res.json({
      function: functionName,
      success: credentials.configured,
      status_code: credentials.configured ? 200 : 404,
      source: credentials.source,
      connection_type: credentials.connectionType?.id,
      credential_field_status: credentials.fieldStatus || {},
      message: credentials.configured
        ? 'Credential lookup succeeded.'
        : credentials.message || 'Credential lookup failed.',
    });
  }

  if (functionName === 'previewApiData') {
    return res.json({ function: functionName, ok: true, preview: [] });
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
  if (isCosmosConfigured()) {
    try {
      await initializeConnectionStore();
      console.log(`Cosmos connection store ready: ${config.cosmosDatabaseName}.${config.cosmosConnectionsCollection}`);
    } catch (error) {
      console.error('Cosmos connection store initialization failed:', error);
    }
  } else {
    console.warn('AZURE_COSMOS_CONNECTIONSTRING is not set; /webhooks/:clientName will return 503.');
  }

  app.listen(config.port, () => {
    console.log(`Backend listening on http://localhost:${config.port}`);
  });
};

start().catch((error) => {
  console.error('Backend failed to start:', error);
  process.exit(1);
});
