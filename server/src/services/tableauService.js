import { config } from '../config.js';

const TABLEAU_REST_VERSION = '3.22';

const restUrl = (path) =>
  `${config.tableauServerUrl}/api/${TABLEAU_REST_VERSION}${path}`;

export const isTableauConfigured = () =>
  Boolean(config.tableauServerUrl && config.tableauSiteName && config.tableauPatName && config.tableauPatSecret);

const signIn = async () => {
  const res = await fetch(restUrl('/auth/signin'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      credentials: {
        personalAccessTokenName: config.tableauPatName,
        personalAccessTokenSecret: config.tableauPatSecret,
        site: { contentUrl: config.tableauSiteName },
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tableau sign-in failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return {
    token: data.credentials?.token,
    siteId: data.credentials?.site?.id,
  };
};

const signOut = async (token) => {
  await fetch(restUrl('/auth/signout'), {
    method: 'POST',
    headers: { 'X-Tableau-Auth': token },
  }).catch(() => {});
};

const findDatasourceLuid = async (token, siteId) => {
  const nameFilter = encodeURIComponent(`name:eq:${config.tableauDatasourceName}`);
  const res = await fetch(restUrl(`/sites/${siteId}/datasources?filter=${nameFilter}&pageSize=10`), {
    headers: { 'X-Tableau-Auth': token, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Tableau datasource lookup failed (${res.status})`);
  }
  const data = await res.json();
  const sources = data.datasources?.datasource ?? [];
  const match = sources.find(
    (s) => !config.tableauProjectName || s.project?.name === config.tableauProjectName,
  ) ?? sources[0];
  if (!match) {
    throw new Error(`Datasource "${config.tableauDatasourceName}" not found in Tableau site.`);
  }
  return match.id;
};

const queryDatasource = async (token, siteId, datasourceLuid) => {
  const url = `${config.tableauServerUrl}/api/v1/sites/${siteId}/vizql-data-service/query-data-source`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Tableau-Auth': token,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      datasource: { datasourceLuid },
      query: { fields: [], limit: 5000 },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tableau VizQL query failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
};

const findColumn = (headers, candidates) => {
  const normalized = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const want = candidates.map(normalized);
  return headers.find((h) => want.includes(normalized(h))) ?? null;
};

const parseClientCampaignData = (rows, headers) => {
  const clientCol = findColumn(headers, ['client name', 'client_name', 'clientname', 'client']);
  const campaignCol = findColumn(headers, ['campaign name', 'campaign_name', 'campaignname', 'campaign']);
  const urlCol = findColumn(headers, ['notion url', 'notion_url', 'notionurl', 'url']);

  if (!clientCol || !campaignCol) {
    throw new Error(
      `Could not identify client/campaign columns. Found columns: ${headers.join(', ')}`,
    );
  }

  const clientSet = new Set();
  const campaigns = {};

  for (const row of rows) {
    const client = (row[clientCol] ?? '').trim();
    const campaign = (row[campaignCol] ?? '').trim();
    const notionUrl = urlCol ? (row[urlCol] ?? '').trim() : '';
    if (!client) continue;
    clientSet.add(client);
    if (!campaigns[client]) campaigns[client] = [];
    if (campaign && !campaigns[client].some((c) => c.name === campaign)) {
      campaigns[client].push({ name: campaign, notion_url: notionUrl });
    }
  }

  return {
    clients: Array.from(clientSet).sort(),
    campaigns,
  };
};

export const getClientsAndCampaigns = async () => {
  if (!isTableauConfigured()) {
    throw new Error('Tableau is not configured (missing PAT or server URL).');
  }

  const { token, siteId } = await signIn();
  try {
    const datasourceLuid = await findDatasourceLuid(token, siteId);
    const result = await queryDatasource(token, siteId, datasourceLuid);

    const rows = result.data ?? [];
    if (!rows.length) return { clients: [], campaigns: {} };

    const headers = Object.keys(rows[0]);
    return parseClientCampaignData(rows, headers);
  } catch (err) {
    // VizQL Data Service returns 404 if not enabled for this site/tier.
    // Fall back to querying the underlying Notion database directly.
    if (err.message.includes('404') || err.message.includes('VizQL')) {
      const { isNotionConfigured, getClientsAndCampaignsFromNotion } = await import('./notionService.js');
      if (isNotionConfigured()) {
        console.log('[Tableau] VizQL unavailable, falling back to Notion API');
        return getClientsAndCampaignsFromNotion();
      }
    }
    throw err;
  } finally {
    await signOut(token).catch(() => {});
  }
};
