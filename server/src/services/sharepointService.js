import { config } from '../config.js';

export const isSharePointConfigured = () => Boolean(
  config.sharepointTenantId
  && config.sharepointClientId
  && config.sharepointClientSecret
  && config.sharepointSiteUrl,
);

// In-memory token cache — cleared on restart, re-acquired automatically
const tokenCache = { value: null, expiresAt: 0 };

const getAccessToken = async () => {
  if (tokenCache.value && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.value;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.sharepointClientId,
    client_secret: config.sharepointClientSecret,
    scope: 'https://graph.microsoft.com/.default',
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${config.sharepointTenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`SharePoint auth failed: ${data.error_description || data.error || response.status}`);
  }

  tokenCache.value = data.access_token;
  tokenCache.expiresAt = Date.now() + data.expires_in * 1000;
  return tokenCache.value;
};

const graphGet = async (path) => {
  const token = await getAccessToken();
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `Graph API error: ${response.status}`);
  }
  return data;
};

// Site ID cached after first lookup — it won't change between restarts
let cachedSiteId = null;

const getSiteId = async () => {
  if (cachedSiteId) return cachedSiteId;

  const url = new URL(config.sharepointSiteUrl);
  const site = await graphGet(`/sites/${url.hostname}:${url.pathname}`);
  cachedSiteId = site.id;
  return cachedSiteId;
};

export const readFileAsText = async (filePath) => {
  const siteId = await getSiteId();
  const token = await getAccessToken();
  const encodedPath = filePath.split('/').map((p) => encodeURIComponent(p)).join('/');
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodedPath}:/content`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SharePoint file read failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.text();
};

export const browseFolder = async (itemId = null) => {
  const siteId = await getSiteId();

  const basePath = itemId
    ? `/sites/${siteId}/drive/items/${itemId}/children`
    : `/sites/${siteId}/drive/root/children`;

  const data = await graphGet(
    `${basePath}?$select=id,name,folder,webUrl,parentReference&$orderby=name asc&$top=200`,
  );

  const items = (data.value || [])
    .filter((item) => item.folder !== undefined)
    .map((item) => ({
      id: item.id,
      name: item.name,
      childCount: item.folder?.childCount ?? 0,
      webUrl: item.webUrl,
    }));

  return { items };
};
