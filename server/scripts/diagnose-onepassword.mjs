import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const baseUrl = process.env.ONEPASSWORD_CONNECT_URL;
const token = process.env.ONEPASSWORD_TOKEN;
const vaultUuid = process.env.ONEPASSWORD_VAULT_UUID;

if (!baseUrl || !token) {
  console.error('Missing ONEPASSWORD_CONNECT_URL or ONEPASSWORD_TOKEN');
  process.exit(1);
}

const requestJson = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    if (contentType.includes('text/html') || String(data).includes('<!DOCTYPE html>')) {
      throw new Error(`Received an HTML page instead of a JSON response. Check that ONEPASSWORD_CONNECT_URL points to the Connect API host, such as https://connect.1password.com, not your account URL.`);
    }
    throw new Error(`HTTP ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }

  return data;
};

const main = async () => {
  console.log('1Password Connect diagnostics');
  console.log('Base URL:', baseUrl);
  console.log('Vault UUID:', vaultUuid || '(not provided)');
  console.log('Token prefix:', token.slice(0, 20));
  console.log('---');

  try {
    const vaults = await requestJson(`${baseUrl.replace(/\/$/, '')}/v1/vaults`);
    console.log('Vaults visible to token:');
    console.dir(vaults, { depth: 3 });
  } catch (error) {
    console.error('Failed to list vaults:', error.message);
  }

  if (vaultUuid) {
    try {
      console.log('---');
      console.log('Items in configured vault:');
      const items = await requestJson(`${baseUrl.replace(/\/$/, '')}/v1/vaults/${vaultUuid}/items`);
      console.dir(items, { depth: 4 });
    } catch (error) {
      console.error('Failed to list vault items:', error.message);
    }
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
