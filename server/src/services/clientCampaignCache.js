import { getEntityById, createEntity, updateEntity } from './cosmosEntityStore.js';

const CACHE_ENTITY = 'ClientCampaignIndex';
const CACHE_ID = 'singleton';
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export const getCached = async () => {
  const doc = await getEntityById(CACHE_ENTITY, CACHE_ID).catch(() => null);
  if (!doc) return { data: null, stale: true };
  const age = Date.now() - new Date(doc.refreshed_at || 0).getTime();
  return { data: doc, stale: age > CACHE_TTL_MS };
};

export const setCache = async (clients, campaigns) => {
  const payload = { clients, campaigns, refreshed_at: new Date().toISOString() };
  const existing = await getEntityById(CACHE_ENTITY, CACHE_ID).catch(() => null);
  if (existing) {
    return updateEntity(CACHE_ENTITY, CACHE_ID, payload);
  }
  return createEntity(CACHE_ENTITY, { id: CACHE_ID, ...payload });
};
