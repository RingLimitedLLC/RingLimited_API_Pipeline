import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '../../data');
const credentialsFile = path.join(dataDir, 'credentials.json');

const ensureDataDir = async () => {
  await fs.mkdir(dataDir, { recursive: true });
};

const readStore = async () => {
  await ensureDataDir();
  try {
    const content = await fs.readFile(credentialsFile, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.writeFile(credentialsFile, JSON.stringify({}, null, 2), 'utf8');
      return {};
    }
    throw error;
  }
};

const writeStore = async (store) => {
  await ensureDataDir();
  await fs.writeFile(credentialsFile, JSON.stringify(store, null, 2), 'utf8');
};

export const getLocalCredentialItem = async (itemId) => {
  const store = await readStore();
  return store[itemId] || null;
};

export const saveLocalCredentialItem = async (itemId, item) => {
  const store = await readStore();
  store[itemId] = item;
  await writeStore(store);
  return item;
};

export const listLocalCredentialItems = async () => {
  const store = await readStore();
  return Object.entries(store).map(([id, item]) => ({ id, item }));
};
