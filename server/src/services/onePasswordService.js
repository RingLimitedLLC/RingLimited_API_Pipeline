import { config } from '../config.js';
import { getLocalCredentialItem, saveLocalCredentialItem } from './localCredentialStore.js';
import {
  buildCredentialFieldStatus,
  getAllSecretFieldKeys,
  normalizeConnectionFields,
  parseCredentialFieldStatus,
  resolveConnectionType,
} from './connectionTypes.js';

const RING_TAG = 'ring-api-pipeline';

const toJson = async (response) => {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

export const isOnePasswordConnectConfigured = () => (
  Boolean(config.onePasswordConnectUrl && config.onePasswordToken)
);

const isLocalCredentialStoreEnabled = () => (
  !isOnePasswordConnectConfigured() && config.nodeEnv !== 'production'
);

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const onePasswordRequest = async (path, options = {}) => {
  if (!isOnePasswordConnectConfigured()) {
    throw new Error('1Password Connect is not configured.');
  }

  const {
    retries = 0,
    retryDelayMs = 500,
    ...fetchOptions
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(`${config.onePasswordConnectUrl}${path}`, {
      ...fetchOptions,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.onePasswordToken}`,
        ...(fetchOptions.headers || {}),
      },
    });

    const body = await toJson(response);
    if (response.ok) {
      return body;
    }

    const message = typeof body === 'object' && body?.message
      ? body.message
      : `1Password request failed: ${response.status}`;
    lastError = new Error(message);
    lastError.status = response.status;

    if (response.status === 404 && attempt < retries) {
      await sleep(retryDelayMs);
      continue;
    }

    throw lastError;
  }

  throw lastError;
};

const getCredentialItemId = (client = {}) => (
  client.onepassword_item_id
  || client.credential_item_id
  || client.op_item_id
  || ''
);

const getCredentialVaultId = (client = {}) => (
  client.vaultId
  || client.onepassword_vault_uuid
  || client.onePasswordVaultUuid
  || config.onePasswordVaultUuid
  || ''
);

const fieldValue = (field) => {
  if (!field) return '';
  if (field.value !== undefined && field.value !== null) return field.value;
  if (field.generated !== undefined && field.generated !== null) return field.generated;
  return '';
};

const normalizeFieldName = (value = '') => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '');

export const getOnePasswordItem = async (vaultId, itemId, options = {}) => {
  if (!itemId) {
    return null;
  }

  if (isOnePasswordConnectConfigured()) {
    if (!vaultId) {
      throw new Error('A 1Password vault ID is required for this item lookup.');
    }

    return onePasswordRequest(
      `/v1/vaults/${encodeURIComponent(vaultId)}/items/${encodeURIComponent(itemId)}`,
      {
        retries: options.retries ?? 5,
        retryDelayMs: options.retryDelayMs ?? 500,
      },
    );
  }

  if (!isLocalCredentialStoreEnabled()) {
    throw new Error('1Password Connect is not configured; local credential storage is disabled.');
  }

  return getLocalCredentialItem(itemId);
};

export const getOnePasswordFieldValue = (item, candidates = []) => {
  const wanted = new Set(
    candidates
      .filter(Boolean)
      .map((candidate) => normalizeFieldName(candidate)),
  );

  if (!wanted.size) {
    return '';
  }

  const fields = Array.isArray(item?.fields) ? item.fields : [];

  for (const field of fields) {
    const fieldNames = [
      field?.label,
      field?.id,
      field?.purpose,
    ].map((value) => normalizeFieldName(value));

    if (fieldNames.some((fieldName) => wanted.has(fieldName))) {
      return fieldValue(field);
    }
  }

  return '';
};

const extractItemFields = (connectionType, item) => {
  const rawFields = Object.fromEntries(
    (item?.fields || [])
      .filter((field) => field?.label)
      .map((field) => [field.label, fieldValue(field)]),
  );

  return normalizeConnectionFields(connectionType, rawFields);
};

const makeOnePasswordField = (definition, value, existingField = {}) => ({
  ...existingField,
  label: definition.key,
  type: definition.onePasswordType || (definition.secret ? 'CONCEALED' : 'STRING'),
  value: String(value),
});

const mergeItemFields = (connectionType, existingItem, submittedFields) => {
  const existingFields = Array.isArray(existingItem?.fields) ? existingItem.fields : [];
  const byLabel = new Map(existingFields.filter((field) => field?.label).map((field) => [field.label, field]));
  const managedLabels = new Set((connectionType.fields || []).map((field) => field.key));
  const unmanagedFields = existingFields.filter((field) => !field?.label || !managedLabels.has(field.label));

  const managedFields = (connectionType.fields || [])
    .map((definition) => {
      const nextValue = submittedFields[definition.key];
      const existingField = byLabel.get(definition.key);

      if (nextValue !== undefined && nextValue !== null && nextValue !== '') {
        return makeOnePasswordField(definition, nextValue, existingField);
      }

      if (existingField) {
        return existingField;
      }

      return null;
    })
    .filter(Boolean);

  return [...unmanagedFields, ...managedFields];
};

const buildItemPayload = ({
  client,
  connectionType,
  fields,
  existingItem,
  vaultId,
}) => {
  const existingTags = Array.isArray(existingItem?.tags) ? existingItem.tags : [];
  const tags = Array.from(new Set([
    ...existingTags,
    RING_TAG,
    `connection-type:${connectionType.id}`,
  ]));

  return {
    title: existingItem?.title || `${client.client_name || client.id} ${connectionType.label} credentials`,
    category: existingItem?.category || 'API_CREDENTIAL',
    vault: { id: vaultId },
    tags,
    fields: mergeItemFields(connectionType, existingItem, fields),
  };
};

const fetchExistingItem = async (itemId, vaultId) => {
  if (!itemId) {
    return null;
  }

  return getOnePasswordItem(vaultId, itemId, { retries: 5 });
};

const saveItem = async ({
  client,
  connectionType,
  submittedFields,
  existingItem,
  itemId,
  vaultId,
}) => {
  const effectiveVaultId = vaultId || config.onePasswordVaultUuid;
  const payload = buildItemPayload({
    client,
    connectionType,
    fields: submittedFields,
    existingItem,
    vaultId: effectiveVaultId || 'local-development',
  });

  if (isOnePasswordConnectConfigured()) {
    if (!effectiveVaultId) {
      throw new Error('A 1Password vault ID is required before credentials can be saved.');
    }

    if (itemId && existingItem) {
      return onePasswordRequest(`/v1/vaults/${encodeURIComponent(effectiveVaultId)}/items/${encodeURIComponent(itemId)}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    }

    return onePasswordRequest(`/v1/vaults/${encodeURIComponent(effectiveVaultId)}/items`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  if (!isLocalCredentialStoreEnabled()) {
    throw new Error('1Password Connect is not configured; local credential storage is disabled.');
  }

  const localItemId = itemId || client.id;
  const localItem = {
    ...payload,
    id: localItemId,
    vault: { id: effectiveVaultId || 'local-development' },
  };

  await saveLocalCredentialItem(localItemId, localItem);
  return localItem;
};

const requireConnectionFields = ({ connectionType, submittedFields, existingFields }) => {
  const missingFields = (connectionType.fields || [])
    .filter((field) => field.required)
    .filter((field) => !submittedFields[field.key] && !existingFields[field.key])
    .map((field) => field.label);

  if (missingFields.length) {
    throw new Error(`Missing required credential fields: ${missingFields.join(', ')}`);
  }
};

export const getClientCredentials = async (client) => {
  const clientId = typeof client === 'string' ? client : client?.id;
  const clientRecord = typeof client === 'string' ? { id: client } : client;
  const connectionType = resolveConnectionType({
    connectionType: clientRecord?.connection_type,
    crmType: clientRecord?.crm_type,
    authType: clientRecord?.auth_type,
  });
  const itemId = getCredentialItemId(clientRecord) || clientId;
  const vaultId = getCredentialVaultId(clientRecord);

  if (!itemId) {
    return {
      configured: false,
      message: 'No client or 1Password item ID was provided.',
      connectionType,
    };
  }

  try {
    const item = await fetchExistingItem(itemId, vaultId);
    if (!item) {
      return {
        configured: false,
        message: 'No credential item has been saved for this client yet.',
        clientId,
        itemId,
        connectionType,
      };
    }

    const fields = extractItemFields(connectionType, item);

    return {
      configured: true,
      source: isOnePasswordConnectConfigured() ? 'onepassword-connect' : 'local-json',
      itemId: item.id || itemId,
      connectionType,
      item: {
        id: item.id || itemId,
        title: item.title || clientId,
        category: item.category || 'API_CREDENTIAL',
        vault: item.vault || null,
      },
      fields,
      fieldStatus: buildCredentialFieldStatus(connectionType, fields),
    };
  } catch (error) {
    return {
      configured: false,
      message: error.message,
      clientId,
      itemId,
      connectionType,
    };
  }
};

export const saveClientCredentials = async (client, payload = {}) => {
  const connectionType = resolveConnectionType({
    connectionType: payload.connection_type || client?.connection_type,
    crmType: payload.crm_type || client?.crm_type,
    authType: payload.auth_type || client?.auth_type,
  });
  const submittedFields = normalizeConnectionFields(connectionType, {
    ...(payload.fields || {}),
    ...payload,
  });
  const itemId = getCredentialItemId(client);
  const vaultId = getCredentialVaultId(client);
  const existingItem = await fetchExistingItem(itemId, vaultId);
  const existingFields = existingItem ? extractItemFields(connectionType, existingItem) : {};

  requireConnectionFields({ connectionType, submittedFields, existingFields });

  const savedItem = await saveItem({
    client,
    connectionType,
    submittedFields,
    existingItem,
    itemId,
    vaultId,
  });
  const savedFields = {
    ...existingFields,
    ...submittedFields,
  };
  const fieldStatus = buildCredentialFieldStatus(connectionType, savedFields);

  return {
    success: true,
    source: isOnePasswordConnectConfigured() ? 'onepassword-connect' : 'local-json',
    connectionType,
    itemId: savedItem.id || itemId || client.id,
    vaultId: savedItem.vault?.id || vaultId || 'local-development',
    fields: savedFields,
    fieldStatus,
  };
};

export const buildClientCredentialMetadata = ({ client, payload = {}, saveResult }) => {
  const { connectionType, fields, fieldStatus, itemId, vaultId } = saveResult;
  const metadata = {
    connection_type: connectionType.id,
    crm_type: payload.crm_type || client.crm_type || connectionType.label,
    auth_type: connectionType.defaultAuthType || payload.auth_type || client.auth_type || '',
    onepassword_item_id: itemId,
    onepassword_vault_uuid: vaultId,
    credential_field_status: JSON.stringify(fieldStatus),
    connection_status: 'Connected',
  };

  if (payload.client_name !== undefined) {
    metadata.client_name = payload.client_name;
  }

  for (const setting of connectionType.settings || []) {
    if (payload.settings?.[setting.key] !== undefined) {
      metadata[setting.key] = payload.settings[setting.key];
    } else if (payload[setting.key] !== undefined) {
      metadata[setting.key] = payload[setting.key];
    } else if (client[setting.key] === undefined && setting.defaultValue !== undefined) {
      metadata[setting.key] = setting.defaultValue;
    }
  }

  for (const field of connectionType.fields || []) {
    if (!field.secret && fields[field.key] !== undefined) {
      metadata[field.key] = fields[field.key];
      if (field.mirrorToClient) {
        metadata[field.mirrorToClient] = fields[field.key];
      }
    }
  }

  for (const secretFieldKey of getAllSecretFieldKeys()) {
    metadata[secretFieldKey] = '';
  }

  return metadata;
};

export const getCredentialStatusForClient = (client = {}) => {
  const connectionType = resolveConnectionType({
    connectionType: client.connection_type,
    crmType: client.crm_type,
    authType: client.auth_type,
  });

  return {
    connectionType,
    fieldStatus: parseCredentialFieldStatus(client.credential_field_status),
  };
};
