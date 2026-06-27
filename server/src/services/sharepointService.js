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

// Debug helper: returns the available drives in the site plus the result of
// searching for a filename. Lets us discover the correct path without guessing.
export const debugSharePointPath = async (searchFileName) => {
  const siteId = await getSiteId();
  const token = await getAccessToken();

  // List all drives on the site
  const drivesData = await graphGet(`/sites/${siteId}/drives?$select=id,name,driveType,webUrl`);
  const drives = (drivesData.value || []).map((d) => ({
    id: d.id,
    name: d.name,
    driveType: d.driveType,
    webUrl: d.webUrl,
  }));

  // Search for the file by name across the default drive
  let searchResults = [];
  try {
    const q = encodeURIComponent(searchFileName);
    const searchData = await graphGet(`/sites/${siteId}/drive/root/search(q='${q}')?$select=id,name,webUrl,parentReference&$top=10`);
    searchResults = (searchData.value || []).map((item) => ({
      name: item.name,
      webUrl: item.webUrl,
      parentPath: item.parentReference?.path ?? '',
      driveId: item.parentReference?.driveId ?? '',
    }));
  } catch (err) {
    searchResults = [{ error: err.message }];
  }

  // Also list root children of the default drive to see what's there
  let rootItems = [];
  try {
    const rootData = await graphGet(`/sites/${siteId}/drive/root/children?$select=id,name,folder,webUrl&$top=50`);
    rootItems = (rootData.value || []).map((i) => ({ name: i.name, isFolder: !!i.folder, webUrl: i.webUrl }));
  } catch (err) {
    rootItems = [{ error: err.message }];
  }

  return { siteId, drives, searchResults, rootItems };
};

// Search for a file by name across all drives on the site, then return its text content.
// More robust than path-based access — works regardless of folder structure.
export const readFileByName = async (fileName) => {
  const siteId = await getSiteId();
  const token = await getAccessToken();

  // Search across all drives on the site
  const drives = await graphGet(`/sites/${siteId}/drives?$select=id,name`);
  const driveList = drives.value || [];

  for (const drive of driveList) {
    try {
      const q = encodeURIComponent(fileName);
      const searchData = await graphGet(
        `/sites/${siteId}/drives/${drive.id}/root/search(q='${q}')?$select=id,name,webUrl&$top=10`,
      );
      const match = (searchData.value || []).find(
        (item) => item.name.toLowerCase().startsWith(fileName.toLowerCase()),
      );
      if (match) {
        const res = await fetch(
          `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${drive.id}/items/${match.id}/content`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`File download failed (${res.status}): ${text.slice(0, 200)}`);
        }
        return res.text();
      }
    } catch (err) {
      // If one drive fails, try the next
      console.warn(`[SharePoint] Drive "${drive.name}" search failed:`, err.message);
    }
  }

  throw new Error(
    `File "${fileName}" not found in any drive on the SharePoint site. ` +
    `Check that the file exists and the app registration has Sites.Read.All or Files.Read.All permission.`,
  );
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
