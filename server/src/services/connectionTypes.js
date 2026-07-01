const normalizeKey = (value = '') => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '');

export const CONNECTION_TYPES = [
  {
    id: 'generic_api_key',
    label: 'Generic API Key',
    aliases: ['API Key', 'HubSpot', 'Salesforce', 'GoHighLevel', 'Other'],
    authTypes: ['API Key'],
    defaultAuthType: 'API Key',
    direction: 'outbound',
    description: 'Standard API endpoint authenticated with a single API key.',
    fields: [
      {
        key: 'api_base_url',
        label: 'API Base URL',
        kind: 'url',
        onePasswordType: 'URL',
        required: true,
        secret: false,
        placeholder: 'https://api.example.com',
      },
      {
        key: 'api_key',
        label: 'API Key',
        kind: 'password',
        onePasswordType: 'CONCEALED',
        required: true,
        secret: true,
        placeholder: 'Paste the API key',
      },
      {
        key: 'webhook_secret',
        label: 'Webhook Secret',
        kind: 'password',
        onePasswordType: 'CONCEALED',
        required: false,
        secret: true,
        placeholder: 'Optional webhook signing secret',
      },
    ],
  },
  {
    id: 'generic_oauth2',
    label: 'OAuth2 / Bearer Token',
    aliases: ['OAuth2', 'Bearer Token'],
    authTypes: ['OAuth2'],
    defaultAuthType: 'OAuth2',
    direction: 'outbound',
    description: 'Standard API endpoint authenticated with bearer credentials.',
    fields: [
      {
        key: 'api_base_url',
        label: 'API Base URL',
        kind: 'url',
        onePasswordType: 'URL',
        required: true,
        secret: false,
        placeholder: 'https://api.example.com',
      },
      {
        key: 'access_token',
        label: 'Access Token',
        kind: 'password',
        onePasswordType: 'CONCEALED',
        required: true,
        secret: true,
        placeholder: 'Bearer access token',
      },
      {
        key: 'refresh_token',
        label: 'Refresh Token',
        kind: 'password',
        onePasswordType: 'CONCEALED',
        required: false,
        secret: true,
        placeholder: 'Optional refresh token',
      },
      {
        key: 'webhook_secret',
        label: 'Webhook Secret',
        kind: 'password',
        onePasswordType: 'CONCEALED',
        required: false,
        secret: true,
        placeholder: 'Optional webhook signing secret',
      },
    ],
  },
  {
    id: 'webhook_only',
    label: 'Webhook Only',
    aliases: ['Webhook Only'],
    authTypes: ['Webhook Only'],
    defaultAuthType: 'Webhook Only',
    direction: 'inbound',
    description: 'Inbound-only connection where the upstream system pushes data to this app.',
    fields: [
      {
        key: 'webhook_secret',
        label: 'Webhook Secret',
        kind: 'password',
        onePasswordType: 'CONCEALED',
        required: false,
        secret: true,
        placeholder: 'Optional webhook signing secret',
      },
    ],
  },
  {
    id: 'client_post',
    label: 'Client Post',
    aliases: ['Client Post'],
    authTypes: ['Client Post'],
    defaultAuthType: 'Client Post',
    direction: 'inbound',
    description: 'Inbound client-post connection with an optional shared API key.',
    fields: [
      {
        key: 'inbound_api_key',
        label: 'Inbound API Key',
        kind: 'password',
        onePasswordType: 'CONCEALED',
        required: false,
        secret: true,
        placeholder: 'Optional shared inbound key',
      },
    ],
  },
  {
    id: 'simplifi',
    label: 'Simplifi',
    aliases: ['Simpli.fi', 'simplifi'],
    authTypes: ['Simplifi'],
    defaultAuthType: 'Simplifi',
    direction: 'performance',
    description: 'Simplifi programmatic advertising platform — internal performance data extraction.',
    testable: true,
    fields: [
      {
        key: 'simplifi_org_key',
        label: 'Organization API Key',
        kind: 'password',
        onePasswordType: 'CONCEALED',
        required: true,
        secret: true,
        placeholder: 'Organization (app) API key',
      },
      {
        key: 'simplifi_user_key',
        label: 'User API Key',
        kind: 'password',
        onePasswordType: 'CONCEALED',
        required: true,
        secret: true,
        placeholder: 'User API key',
      },
    ],
    settings: [
      {
        key: 'simplifi_org_id',
        label: 'Organization ID',
        kind: 'text',
        placeholder: 'Populated automatically on first successful test',
      },
    ],
  },
  {
    id: 'woocommerce',
    label: 'WooCommerce',
    aliases: ['WooCommerce', 'Woo Commerce', 'woo_commerce'],
    authTypes: ['WooCommerce'],
    defaultAuthType: 'WooCommerce',
    direction: 'outbound',
    description: 'WooCommerce REST API connection.',
    testable: true,
    fields: [
      {
        key: 'woo_login_url',
        label: 'Store URL',
        kind: 'url',
        onePasswordType: 'URL',
        required: true,
        secret: false,
        placeholder: 'https://yourstore.com',
        aliases: ['api_base_url', 'store_url'],
        mirrorToClient: 'api_base_url',
      },
      {
        key: 'woo_consumer_key',
        label: 'Consumer Key',
        kind: 'password',
        onePasswordType: 'CONCEALED',
        required: true,
        secret: true,
        placeholder: 'ck_...',
      },
      {
        key: 'woo_consumer_secret',
        label: 'Consumer Secret',
        kind: 'password',
        onePasswordType: 'CONCEALED',
        required: true,
        secret: true,
        placeholder: 'cs_...',
      },
    ],
    settings: [
      {
        key: 'woo_version',
        label: 'API Version',
        kind: 'select',
        defaultValue: 'wc/v3',
        options: [
          { value: 'wc/v3', label: 'wc/v3 (latest)' },
          { value: 'wc/v2', label: 'wc/v2' },
          { value: 'wc/v1', label: 'wc/v1' },
        ],
      },
      {
        key: 'woo_user_agent',
        label: 'User-Agent Header',
        kind: 'text',
        defaultValue: 'RingAPI/1.0',
        placeholder: 'RingAPI/1.0',
      },
    ],
  },
];

const typeMatchesValue = (connectionType, value) => {
  if (!value) return false;
  const normalized = normalizeKey(value);
  return [
    connectionType.id,
    connectionType.label,
    ...(connectionType.aliases || []),
  ].some((candidate) => normalizeKey(candidate) === normalized);
};

export const listConnectionTypes = () => CONNECTION_TYPES.map((connectionType) => ({
  id: connectionType.id,
  label: connectionType.label,
  aliases: connectionType.aliases || [],
  authTypes: connectionType.authTypes || [],
  defaultAuthType: connectionType.defaultAuthType || '',
  direction: connectionType.direction || 'outbound',
  description: connectionType.description || '',
  testable: Boolean(connectionType.testable),
  fields: connectionType.fields,
  settings: connectionType.settings || [],
}));

export const resolveConnectionType = ({
  connectionType,
  crmType,
  authType,
} = {}) => {
  const byExplicitType = CONNECTION_TYPES.find((candidate) => (
    typeMatchesValue(candidate, connectionType)
    || typeMatchesValue(candidate, crmType)
  ));

  if (byExplicitType) {
    return byExplicitType;
  }

  const byAuthType = CONNECTION_TYPES.find((candidate) => (
    (candidate.authTypes || []).some((candidateAuthType) => normalizeKey(candidateAuthType) === normalizeKey(authType))
  ));

  return byAuthType || CONNECTION_TYPES[0];
};

export const getConnectionTypeById = (connectionTypeId) => (
  CONNECTION_TYPES.find((connectionType) => connectionType.id === connectionTypeId) || null
);

export const normalizeConnectionFields = (connectionType, values = {}) => {
  const fields = {};

  for (const field of connectionType.fields || []) {
    const candidateKeys = [field.key, ...(field.aliases || [])];
    const matchingKey = candidateKeys.find((key) => values[key] !== undefined && values[key] !== null && values[key] !== '');
    if (matchingKey) {
      fields[field.key] = values[matchingKey];
    }
  }

  return fields;
};

export const getAllSecretFieldKeys = () => Array.from(new Set(
  CONNECTION_TYPES.flatMap((connectionType) => (
    connectionType.fields || []
  ).filter((field) => field.secret).map((field) => field.key)),
));

export const parseCredentialFieldStatus = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

export const buildCredentialFieldStatus = (connectionType, fields = {}) => (
  Object.fromEntries((connectionType.fields || []).map((field) => [field.key, Boolean(fields[field.key])]))
);
