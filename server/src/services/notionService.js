import { config } from '../config.js';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

const notionFetch = (path) =>
  fetch(`${NOTION_API}${path}`, {
    headers: {
      Authorization: `Bearer ${config.notionIntegrationToken}`,
      'Notion-Version': NOTION_VERSION,
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
