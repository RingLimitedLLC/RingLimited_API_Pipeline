import { inflateRawSync } from 'node:zlib';
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

// Download the .tdsx (ZIP) binary from the Tableau REST API.
// Maps to: GET /api/{version}/sites/{siteId}/datasources/{luid}/content
const downloadDatasource = async (token, siteId, datasourceLuid) => {
  const res = await fetch(
    restUrl(`/sites/${siteId}/datasources/${datasourceLuid}/content`),
    { headers: { 'X-Tableau-Auth': token } },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Datasource download failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
};

// Pure-Node ZIP reader — extracts the first file matching targetSuffix.
// Handles stored (method 0) and deflated (method 8) entries.
const LOCAL_ENTRY_SIG = 0x04034b50;

const extractFileFromZip = (buffer, targetSuffix) => {
  let offset = 0;
  while (offset + 30 < buffer.length) {
    if (buffer.readUInt32LE(offset) !== LOCAL_ENTRY_SIG) break;

    const flags = buffer.readUInt16LE(offset + 6);
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const fileName = buffer.toString('utf8', offset + 30, offset + 30 + fileNameLen);
    const dataStart = offset + 30 + fileNameLen + extraLen;

    // Bit 3: sizes are in a data descriptor after the data (streaming ZIP).
    // We can't find the end without scanning forward, so stop here.
    const isStreaming = (flags & 0x08) !== 0;
    if (isStreaming && compressedSize === 0) break;

    if (fileName.endsWith(targetSuffix)) {
      const raw = buffer.slice(dataStart, dataStart + compressedSize);
      try {
        return method === 0
          ? raw.toString('utf8')
          : inflateRawSync(raw).toString('utf8');
      } catch (err) {
        console.warn('[Tableau] ZIP inflate failed for', fileName, err.message);
      }
    }

    offset = dataStart + compressedSize;
  }
  return null;
};

// Extract Notion database ID from .tds XML connection metadata.
const extractNotionDbId = (tdsXml) => {
  const patterns = [
    /class=['"]notion['"][^>]*\bdbname=['"]([a-f0-9-]{32,36})['"]/i,
    /\bdbname=['"]([a-f0-9-]{32,36})['"]/i,
  ];
  for (const re of patterns) {
    const m = tdsXml.match(re);
    if (m?.[1]) return m[1].replace(/-/g, '');
  }
  return null;
};

// Download the .tdsx and parse the .tds XML to find the Notion database ID.
// Falls back to NOTION_CLIENT_DB_ID in config if extraction fails.
const discoverNotionDbId = async (token, siteId, datasourceLuid) => {
  try {
    const tdsx = await downloadDatasource(token, siteId, datasourceLuid);
    const tdsXml = extractFileFromZip(tdsx, '.tds');
    if (tdsXml) {
      const found = extractNotionDbId(tdsXml);
      if (found) {
        console.log('[Tableau] Notion DB ID extracted from .tds XML:', found);
        return found;
      }
      console.log('[Tableau] .tds parsed but no Notion dbname attribute found');
    } else {
      console.log('[Tableau] Could not extract .tds from .tdsx archive');
    }
  } catch (err) {
    console.warn('[Tableau] .tdsx download/parse error:', err.message);
  }
  if (config.notionClientDbId) {
    console.log('[Tableau] Using NOTION_CLIENT_DB_ID from config');
    return config.notionClientDbId;
  }
  return null;
};

export const getClientsAndCampaigns = async () => {
  if (!isTableauConfigured()) {
    throw new Error('Tableau is not configured (missing PAT or server URL).');
  }

  const { token, siteId } = await signIn();
  try {
    const datasourceLuid = await findDatasourceLuid(token, siteId);
    const notionDbId = await discoverNotionDbId(token, siteId, datasourceLuid);

    const { isNotionConfigured, getClientsAndCampaignsFromNotion } = await import('./notionService.js');
    if (!isNotionConfigured()) {
      throw new Error('Notion is not configured (missing NOTION_INTEGRATION_TOKEN).');
    }
    console.log('[Tableau] Querying Notion DB:', notionDbId ?? '(workspace search)');
    return getClientsAndCampaignsFromNotion(notionDbId);
  } finally {
    signOut(token).catch(() => {});
  }
};
