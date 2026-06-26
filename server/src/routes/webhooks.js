import crypto from 'node:crypto';
import express from 'express';
import { config } from '../config.js';
import {
  getConnectionByClientName,
  isValidClientName,
  normalizeClientName,
} from '../services/cosmosConnectionStore.js';
import {
  getOnePasswordFieldValue,
  getOnePasswordItem,
} from '../services/onePasswordService.js';

const router = express.Router();
const inboundDirections = new Set(['inbound', 'both']);
const activeStatuses = new Set(['active', 'connected', 'enabled']);

const normalizeSignature = (value = '') => {
  const signature = String(value).trim();
  return signature.toLowerCase().startsWith('sha256=')
    ? signature.slice('sha256='.length)
    : signature;
};

const timingSafeCompare = (received, expected) => {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  return (
    receivedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  );
};

const resolveVaultId = (connection = {}) => (
  connection.vaultId
  || connection.onepassword_vault_uuid
  || connection.onePasswordVaultUuid
  || ''
);

const resolveVaultItemId = (connection = {}) => (
  connection.vaultItemId
  || connection.onepassword_item_id
  || connection.onePasswordItemId
  || connection.credential_item_id
  || ''
);

const isConnectionActive = (connection = {}) => (
  activeStatuses.has(String(connection.status || connection.connection_status || '').toLowerCase())
);

const acceptsInboundWebhooks = (connection = {}) => (
  inboundDirections.has(String(connection.direction || '').toLowerCase())
);

router.post('/:clientName', async (req, res) => {
  const clientName = normalizeClientName(req.params.clientName);

  if (!isValidClientName(clientName)) {
    return res.status(400).json({ error: 'invalid clientName' });
  }

  try {
    const connection = await getConnectionByClientName(clientName);
    if (!connection) {
      return res.status(404).json({ error: 'unknown client' });
    }

    if (!acceptsInboundWebhooks(connection)) {
      return res.status(403).json({ error: 'connection does not accept inbound webhooks' });
    }

    if (!isConnectionActive(connection)) {
      return res.status(403).json({ error: 'connection not active' });
    }

    const vaultId = resolveVaultId(connection);
    const vaultItemId = resolveVaultItemId(connection);

    if (!vaultId || !vaultItemId) {
      console.error(`[webhooks] Missing 1Password reference for "${clientName}"`);
      return res.status(500).json({ error: 'integration not configured' });
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const signature = req.get(config.webhookSignatureHeader);
    if (!signature) {
      return res.status(401).json({ error: 'missing signature' });
    }

    const item = await getOnePasswordItem(vaultId, vaultItemId);
    const secret = getOnePasswordFieldValue(item, [
      connection.webhookSecretField,
      connection.webhook_secret_field,
      config.webhookSecretField,
      'webhook_secret',
      'inbound_api_key',
      'PASSWORD',
    ]);

    if (!secret) {
      console.error(`[webhooks] Signing secret not found for "${clientName}"`);
      return res.status(500).json({ error: 'integration not configured' });
    }

    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const received = normalizeSignature(signature);

    if (!timingSafeCompare(received, expected)) {
      return res.status(401).json({ error: 'invalid signature' });
    }

    try {
      JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'invalid JSON payload' });
    }

    console.info(`[webhooks] Accepted webhook for "${clientName}" (${rawBody.length} bytes)`);

    return res.status(200).json({
      received: true,
      clientName,
      receivedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error.code === 'COSMOS_NOT_CONFIGURED') {
      return res.status(503).json({ error: 'connection store not configured' });
    }

    console.error(`[webhooks] Handling failed for "${clientName}":`, error);
    return res.status(500).json({ error: 'internal error' });
  }
});

export default router;
