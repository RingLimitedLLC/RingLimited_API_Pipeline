import { MongoClient, ObjectId } from 'mongodb';
import { config } from '../config.js';

let clientPromise;

export const normalizeClientName = (value = '') => String(value).trim().toLowerCase();

export const isValidClientName = (value = '') => {
  const clientName = normalizeClientName(value);
  return (
    clientName.length >= 2
    && clientName.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(clientName)
  );
};

export const isCosmosConfigured = () => Boolean(config.cosmosConnectionString);

const cosmosNotConfiguredError = () => {
  const error = new Error('AZURE_COSMOS_CONNECTIONSTRING is not configured.');
  error.code = 'COSMOS_NOT_CONFIGURED';
  return error;
};

export const getMongoClient = async () => {
  if (!isCosmosConfigured()) {
    throw cosmosNotConfiguredError();
  }

  if (!clientPromise) {
    clientPromise = new MongoClient(config.cosmosConnectionString).connect();
  }

  return clientPromise;
};

export const getCosmosDb = async () => {
  const client = await getMongoClient();
  return client.db(config.cosmosDatabaseName);
};

export const getConnectionsCollection = async () => {
  const db = await getCosmosDb();
  return db.collection(config.cosmosConnectionsCollection);
};

export const initializeConnectionStore = async () => {
  if (!isCosmosConfigured()) {
    return { configured: false };
  }

  const collection = await getConnectionsCollection();
  await collection.createIndex({ clientName: 1 }, { unique: true, name: 'unique_clientName' });
  await collection.createIndex({ status: 1, direction: 1 }, { name: 'status_direction' });

  return { configured: true };
};

export const getConnectionByClientName = async (clientName) => {
  const normalizedClientName = normalizeClientName(clientName);
  if (!isValidClientName(normalizedClientName)) {
    return null;
  }

  const collection = await getConnectionsCollection();
  return collection.findOne({
    $or: [
      { clientName: normalizedClientName },
      { name: normalizedClientName },
    ],
  });
};

export const toConnectionId = (value) => {
  if (value instanceof ObjectId) {
    return value.toHexString();
  }

  return value ? String(value) : '';
};

export const toPublicConnection = (connection = {}) => {
  const {
    _id,
    vaultId: _vaultId,
    vaultItemId: _vaultItemId,
    ...publicFields
  } = connection;

  return {
    id: toConnectionId(_id),
    ...publicFields,
  };
};
