import crypto from 'node:crypto';
import { getCosmosDb } from './cosmosConnectionStore.js';

const normalizeEntityName = (entityName) =>
  `entities_${entityName.replace(/[^a-z0-9_-]+/gi, '_').toLowerCase()}`;

const getCollection = async (entityName) => {
  const db = await getCosmosDb();
  return db.collection(normalizeEntityName(entityName));
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
  const mongoSort = parsedSort ? { [parsedSort.field]: parsedSort.descending ? -1 : 1 } : {};
  const mongoLimit = Number.isFinite(Number(limit)) ? Number(limit) : 100;
  const docs = await collection
    .find(Object.keys(filters).length ? filters : {})
    .sort(mongoSort)
    .limit(mongoLimit)
    .toArray();
  return docs.map(strip);
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
