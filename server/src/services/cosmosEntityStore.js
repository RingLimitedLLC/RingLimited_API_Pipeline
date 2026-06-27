import crypto from 'node:crypto';
import { getCosmosDb } from './cosmosConnectionStore.js';

const normalizeEntityName = (entityName) =>
  `entities_${entityName.replace(/[^a-z0-9_-]+/gi, '_').toLowerCase()}`;

// Index creation is fire-and-forget: Cosmos builds indexes asynchronously so we
// cannot rely on them being ready immediately after createIndex returns. All
// sorting is done in JS to avoid ORDER BY failures on freshly created collections.
const initializedCollections = new Set();

const getCollection = async (entityName) => {
  const name = normalizeEntityName(entityName);
  const db = await getCosmosDb();
  const collection = db.collection(name);
  if (!initializedCollections.has(name)) {
    initializedCollections.add(name);
    // Fire-and-forget: these improve future query performance once Cosmos builds them.
    collection.createIndex({ created_date: -1 }, { name: 'idx_created_date' }).catch(() => {});
    collection.createIndex({ updated_date: -1 }, { name: 'idx_updated_date' }).catch(() => {});
    collection.createIndex({ id: 1 }, { name: 'idx_id', unique: true }).catch(() => {});
  }
  return collection;
};

const strip = ({ _id, ...rest }) => rest;

const parseSort = (value) => {
  if (!value) return null;
  const descending = value.startsWith('-');
  return { field: descending ? value.slice(1) : value, descending };
};

export const listEntities = async (entityName, { filters = {}, sort, limit } = {}) => {
  const collection = await getCollection(entityName);
  const parsedSort = parseSort(sort);
  const mongoLimit = Number.isFinite(Number(limit)) ? Number(limit) : 100;

  // Fetch without a DB-level sort: Cosmos requires Range indexes for ORDER BY and
  // those may not be ready immediately. We sort in JS instead.
  const docs = await collection
    .find(Object.keys(filters).length ? filters : {})
    .limit(1000)
    .toArray();

  if (parsedSort) {
    docs.sort((a, b) => {
      const av = a[parsedSort.field] ?? '';
      const bv = b[parsedSort.field] ?? '';
      const cmp = String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' });
      return parsedSort.descending ? -cmp : cmp;
    });
  }

  return docs.slice(0, mongoLimit).map(strip);
};

export const getEntityById = async (entityName, id) => {
  const collection = await getCollection(entityName);
  const doc = await collection.findOne({ id });
  return doc ? strip(doc) : null;
};

export const createEntity = async (entityName, payload) => {
  const collection = await getCollection(entityName);
  const entity = {
    ...payload,
    id: payload.id || crypto.randomUUID(),
    created_date: payload.created_date || new Date().toISOString(),
    updated_date: payload.updated_date || new Date().toISOString(),
  };
  await collection.insertOne({ ...entity });
  return entity;
};

export const updateEntity = async (entityName, id, payload) => {
  const collection = await getCollection(entityName);
  const update = { ...payload, id, updated_date: new Date().toISOString() };
  const result = await collection.findOneAndUpdate(
    { id },
    { $set: update },
    { returnDocument: 'after' },
  );
  if (!result) throw new Error('Entity not found');
  return strip(result);
};

export const deleteEntity = async (entityName, id) => {
  const collection = await getCollection(entityName);
  const result = await collection.deleteOne({ id });
  if (result.deletedCount === 0) throw new Error('Entity not found');
  return { deleted: true, id };
};
