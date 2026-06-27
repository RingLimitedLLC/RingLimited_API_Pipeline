import { config } from '../config.js';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

const notionFetch = (path, options = {}) =>
  fetch(`${NOTION_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.notionIntegrationToken}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

export const isNotionConfigured = () => Boolean(config.notionIntegrationToken);

export const getWorkspaceUsers = async () => {
  if (!isNotionConfigured()) {
    throw new Error('NOTION_INTEGRATION_TOKEN is not configured');
  }

  const results = [];
  let cursor;

  do {
    const url = cursor ? `/users?start_cursor=${cursor}` : '/users';
    const res = await notionFetch(url);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `Notion API error ${res.status}`);
    }
    const data = await res.json();
    results.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  return results
    .filter((u) => u.type === 'person' && u.name)
    .map((u) => u.name)
    .sort();
};

// ─── Client / Campaign database query ───────────────────────────────────────

const getPropertyText = (prop) => {
  if (!prop) return '';
  switch (prop.type) {
    case 'title': return (prop.title || []).map((t) => t.plain_text).join('');
    case 'rich_text': return (prop.rich_text || []).map((t) => t.plain_text).join('');
    case 'select': return prop.select?.name ?? '';
    case 'multi_select': return (prop.multi_select || []).map((s) => s.name).join(', ');
    case 'url': return prop.url ?? '';
    case 'formula': return prop.formula?.string ?? String(prop.formula?.number ?? '');
    case 'rollup': return (prop.rollup?.array || []).map(getPropertyText).filter(Boolean).join(', ');
    default: return '';
  }
};

const findPropKey = (properties, candidates) => {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const keys = Object.keys(properties);
  return candidates.map(norm).reduce((found, c) => found || keys.find((k) => norm(k) === c) || keys.find((k) => norm(k).includes(c)), null);
};

const queryAllPages = async (databaseId, filter) => {
  const pages = [];
  let cursor;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    if (filter) body.filter = filter;
    const res = await notionFetch(`/databases/${databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b.message || `Notion database query error ${res.status}`);
    }
    const data = await res.json();
    pages.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return pages;
};

// explicitDbId: passed by tableauService when it extracts it from the .tds XML;
// falls back to config.notionClientDbId, then to a slow workspace search.
export const getClientsAndCampaignsFromNotion = async (explicitDbId) => {
  if (!isNotionConfigured()) throw new Error('NOTION_INTEGRATION_TOKEN is not configured');

  const dbId = explicitDbId || config.notionClientDbId;
  if (dbId) {
    const schemaRes = await notionFetch(`/databases/${dbId}`);
    if (!schemaRes.ok) throw new Error(`Notion database schema fetch failed (${schemaRes.status})`);
    const schema = await schemaRes.json();
    return parseNotionClientCampaignDb(dbId, schema.properties);
  }

  // Slow path: search all databases accessible to the integration
  const searchRes = await notionFetch('/search', {
    method: 'POST',
    body: JSON.stringify({ filter: { object: 'database' }, page_size: 50 }),
  });
  if (!searchRes.ok) throw new Error(`Notion search failed (${searchRes.status})`);
  const searchData = await searchRes.json();
  const databases = searchData.results ?? [];

  const match = databases.find((db) => {
    const props = Object.keys(db.properties || {}).map((p) => p.toLowerCase());
    return props.some((p) => p.includes('client')) && props.some((p) => p.includes('campaign'));
  });

  if (!match) {
    throw new Error(
      'Could not auto-detect the Client/Campaign Notion database. ' +
      'Set NOTION_CLIENT_DB_ID in app settings to the Notion database ID.',
    );
  }

  return parseNotionClientCampaignDb(match.id, match.properties);
};

const parseNotionClientCampaignDb = async (databaseId, properties) => {
  const clientKey = findPropKey(properties, ['clientname', 'client name', 'client']);
  const campaignKey = findPropKey(properties, ['campaignname', 'campaign name', 'campaign']);
  const urlKey = findPropKey(properties, ['notionurl', 'notion url', 'url', 'link']);

  if (!clientKey || !campaignKey) {
    const found = Object.keys(properties).join(', ');
    throw new Error(`Could not identify client/campaign columns in Notion database. Found: ${found}`);
  }

  // Try to apply an "Active" filter if such a property exists
  const activeKey = findPropKey(properties, ['active', 'status', 'isactive']);
  const activeType = activeKey ? properties[activeKey]?.type : null;
  let filter;
  if (activeKey && activeType === 'checkbox') {
    filter = { property: activeKey, checkbox: { equals: true } };
  } else if (activeKey && activeType === 'status') {
    filter = { property: activeKey, status: { equals: 'Active' } };
  }

  const pages = await queryAllPages(databaseId, filter);

  const clientSet = new Set();
  const campaigns = {};

  for (const page of pages) {
    const client = getPropertyText(page.properties[clientKey]).trim();
    const campaign = getPropertyText(page.properties[campaignKey]).trim();
    const notionUrl = urlKey ? getPropertyText(page.properties[urlKey]).trim() : page.url ?? '';
    if (!client) continue;
    clientSet.add(client);
    if (!campaigns[client]) campaigns[client] = [];
    if (campaign && !campaigns[client].some((c) => c.name === campaign)) {
      campaigns[client].push({ name: campaign, notion_url: notionUrl });
    }
  }

  return { clients: Array.from(clientSet).sort(), campaigns };
};
