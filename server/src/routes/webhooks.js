import crypto from 'node:crypto';
import express from 'express';
import { getEntityById, createEntity } from '../services/entityStore.js';
import { getConnectionCredentials } from '../services/onePasswordService.js';
import { writeFileToFolder } from '../services/sharepointService.js';

const router = express.Router();

// Connection types that accept inbound HTTP pushes via this route
const INBOUND_TYPES = new Set(['webhook_only', 'client_post']);

const normalizeSignature = (value = '') => {
  const sig = String(value).trim();
  return sig.toLowerCase().startsWith('sha256=') ? sig.slice('sha256='.length) : sig;
};

// Constant-time comparison — prevents timing-attack credential enumeration
const safeCompare = (a, b) => {
  try {
    const aBuf = Buffer.isBuffer(a) ? a : Buffer.from(String(a));
    const bBuf = Buffer.isBuffer(b) ? b : Buffer.from(String(b));
    if (aBuf.length !== bBuf.length) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
};

const csvEscape = (value) => {
  const str = (value !== null && typeof value === 'object')
    ? JSON.stringify(value)
    : String(value ?? '');
  return (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r'))
    ? `"${str.replace(/"/g, '""')}"`
    : str;
};

const toCsv = (rows) => {
  if (!rows.length) return '';
  // Union of all keys across all rows so sparse records still get every column
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return [
    headers.map(csvEscape).join(','),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h] ?? '')).join(',')),
  ].join('\n');
};

// POST /webhooks/:connectionId
// Each inbound Connection has its own unique, stable endpoint derived from its ID.
router.post('/:connectionId', async (req, res) => {
  const { connectionId } = req.params;

  try {
    // ── 1. Load the Connection record ──────────────────────────────────────────
    const connection = await getEntityById('Connections', connectionId);
    if (!connection) {
      return res.status(404).json({ error: 'unknown connection' });
    }

    const connectionType = connection.connection_type;
    if (!INBOUND_TYPES.has(connectionType)) {
      return res.status(403).json({ error: 'this connection does not accept inbound webhooks' });
    }

    // ── 2. Authenticate ────────────────────────────────────────────────────────
    // Raw body is preserved by the express.raw() middleware mounted in server.js
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');

    const credentials = await getConnectionCredentials(connection);
    if (!credentials.configured) {
      console.error(`[webhooks] Credentials not configured for connection "${connectionId}"`);
      return res.status(500).json({ error: 'credentials not configured for this connection' });
    }

    if (connectionType === 'webhook_only') {
      // HMAC-SHA256 — client signs the raw body with the shared webhook_secret
      const signature = req.get('x-signature') || req.get('x-hub-signature-256') || '';
      if (!signature) {
        return res.status(401).json({
          error: 'missing x-signature header',
          hint: 'Compute HMAC-SHA256(raw_body, webhook_secret) and send as: x-signature: sha256=<hex>',
        });
      }
      const secret = credentials.fields?.webhook_secret;
      if (!secret) {
        return res.status(500).json({ error: 'webhook_secret not set — add it in the Credentials section' });
      }
      const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      if (!safeCompare(normalizeSignature(signature), expected)) {
        return res.status(401).json({ error: 'invalid signature' });
      }
    } else {
      // client_post — bearer token in Authorization header
      const authHeader = req.get('Authorization') || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
      if (!token) {
        return res.status(401).json({
          error: 'missing Authorization header',
          hint: 'Send: Authorization: Bearer <api_key>',
        });
      }
      const apiKey = credentials.fields?.inbound_api_key;
      if (!apiKey) {
        return res.status(500).json({ error: 'inbound_api_key not set — add it in the Credentials section' });
      }
      if (!safeCompare(token, apiKey)) {
        return res.status(401).json({ error: 'invalid API key' });
      }
    }

    // ── 3. Parse payload ───────────────────────────────────────────────────────
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'request body must be valid JSON' });
    }

    // Normalise to an array of records regardless of whether the client sends
    // a single object or an array
    const records = Array.isArray(payload) ? payload : [payload];
    console.info(`[webhooks] Connection "${connectionId}" received ${records.length} record(s)`);

    // ── 4. Write to SharePoint (if folder configured on the connection) ─────────
    const startedAt = new Date().toISOString();
    let status = 'Success';
    let errorMessage = '';
    let sharepointUrl = null;

    const folderItemId = connection.sharepoint_folder_id || '';
    const folderPath = connection.sharepoint_folder_path || '';

    if (folderItemId || folderPath) {
      try {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const pad3 = (n) => String(n).padStart(3, '0');
        const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}_${pad(now.getSeconds())}${pad3(now.getMilliseconds())}`;
        const prefix = connectionType === 'webhook_only' ? 'pipelinewebhook' : 'pipelineclientpost';
        const clientName = (connection.client_name || 'Client').replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `${prefix}_T_X_${clientName}_${ts}.csv`;

        const flatRecords = records.map((r) =>
          typeof r === 'object' && r !== null ? r : { value: r },
        );
        const csvContent = toCsv(flatRecords);
        const writeResult = await writeFileToFolder(folderItemId, folderPath, filename, csvContent);
        sharepointUrl = writeResult.webUrl;
        console.info(`[webhooks] SharePoint write OK → ${sharepointUrl}`);
      } catch (writeErr) {
        status = 'Failed';
        errorMessage = `SharePoint write failed: ${writeErr.message}`;
        console.error(`[webhooks] SharePoint write error for "${connectionId}":`, writeErr.message);
      }
    } else {
      console.info(`[webhooks] No SharePoint folder on connection "${connectionId}" — data received, not forwarded`);
    }

    // ── 5. Log the receipt ─────────────────────────────────────────────────────
    const finishedAt = new Date().toISOString();
    createEntity('SyncLogs', {
      client_id: connection.client_id,
      connection_id: connection.id,
      job_name: 'Inbound Webhook',
      sync_type: 'Inbound',
      status,
      records_processed: records.length,
      error_message: errorMessage,
      started_at: startedAt,
      finished_at: finishedAt,
    }).catch((e) => console.error('[webhooks] Failed to write SyncLog:', e.message));

    return res.status(200).json({
      received: true,
      records: records.length,
      status,
      receivedAt: finishedAt,
      ...(sharepointUrl && { sharepoint_url: sharepointUrl }),
      ...(errorMessage && { warning: errorMessage }),
    });

  } catch (err) {
    console.error(`[webhooks] Unhandled error for "${connectionId}":`, err);
    return res.status(500).json({ error: 'internal error' });
  }
});

export default router;
