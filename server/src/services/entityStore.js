import { isCosmosConfigured } from './cosmosConnectionStore.js';
import * as cosmosStore from './cosmosEntityStore.js';
import * as csvStore from './csvStore.js';

const store = () => (isCosmosConfigured() ? cosmosStore : csvStore);

export const listEntities = (...args) => store().listEntities(...args);
export const getEntityById = (...args) => store().getEntityById(...args);
export const createEntity = (...args) => store().createEntity(...args);
export const updateEntity = (...args) => store().updateEntity(...args);
export const deleteEntity = (...args) => store().deleteEntity(...args);
