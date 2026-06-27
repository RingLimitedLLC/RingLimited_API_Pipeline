import { isSharePointConfigured, readFileByName } from './sharepointService.js';

const INDEX_FILENAME = 'Notion_Client_Campaign_Active_Index';

// Parses a single CSV line, handling quoted fields (including commas inside quotes).
const parseCsvLine = (line) => {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
};

const parseCsv = (text) => {
  const cleaned = text.replace(/^﻿/, '').trim(); // strip UTF-8 BOM
  const lines = cleaned.split(/\r?\n/);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines
    .slice(1)
    .filter((l) => l.trim())
    .map((line) => {
      const values = parseCsvLine(line);
      return Object.fromEntries(headers.map((h, i) => [h, (values[i] ?? '').trim()]));
    });
};

const findCol = (headers, candidates) => {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const want = candidates.map(norm);
  return headers.find((h) => want.includes(norm(h))) ?? null;
};

const buildClientCampaignData = (rows) => {
  if (!rows.length) return { clients: [], campaigns: {} };
  const headers = Object.keys(rows[0]);
  const clientCol = findCol(headers, ['client name', 'client_name', 'clientname', 'client']);
  const campaignCol = findCol(headers, ['campaign name', 'campaign_name', 'campaignname', 'campaign']);
  const urlCol = findCol(headers, ['notion url', 'notion_url', 'notionurl', 'url', 'link']);

  if (!clientCol || !campaignCol) {
    throw new Error(`CSV missing client/campaign columns. Found: ${headers.join(', ')}`);
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

  return { clients: Array.from(clientSet).sort(), campaigns };
};

export const getClientsAndCampaignsFromSharePoint = async () => {
  if (!isSharePointConfigured()) {
    throw new Error('SharePoint is not configured (missing tenant ID, client ID, secret, or site URL).');
  }
  const csvText = await readFileByName(INDEX_FILENAME);
  const rows = parseCsv(csvText);
  return buildClientCampaignData(rows);
};

export { INDEX_FILENAME };
