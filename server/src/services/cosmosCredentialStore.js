import { getCosmosDb, isCosmosConfigured } from './cosmosConnectionStore.js';

const getCollection = async () => {
  const db = await getCosmosDb();
  return db.collection('credentials');
};

export const isCosmosCredentialStoreAvailable = () => isCosmosConfigured();

export const saveCosmosCredential = async (clientId, { connectionType, fields }) => {
  const collection = await getCollection();
  const doc = {
    client_id: clientId,
    connection_type: connectionType,
    fields,
    source: 'cosmos-fallback',
    updated_at: new Date().toISOString(),
  };
  await collection.replaceOne({ client_id: clientId }, doc, { upsert: true });
  return doc;
};

export const getCosmosCredential = async (clientId) => {
  const collection = await getCollection();
  return collection.findOne({ client_id: clientId });
};

export const deleteCosmosCredential = async (clientId) => {
  const collection = await getCollection();
  await collection.deleteOne({ client_id: clientId });
};
