import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '../../data');

const ensureDataDir = async () => {
  await fs.mkdir(dataDir, { recursive: true });
};

const normalizeEntityName = (entityName) => entityName.replace(/[^a-z0-9_-]+/gi, '_').toLowerCase();

const getEntityFilePath = (entityName) => path.join(dataDir, `${normalizeEntityName(entityName)}.csv`);

const escapeCsvValue = (value) => {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
};

const parseCsvLine = (line) => {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
};

const parseCsvContent = (content) => {
  if (!content.trim()) {
    return [];
  }

  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = values[index] ?? '';
      return row;
    }, {});
  });
};

const serializeCsvContent = (rows) => {
  if (!rows.length) {
    return '';
  }

  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const headerLine = headers.map((header) => escapeCsvValue(header)).join(',');
  const rowLines = rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(','));
  return [headerLine, ...rowLines].join('\n');
};

const readRows = async (entityName) => {
  await ensureDataDir();
  const filePath = getEntityFilePath(entityName);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const rows = parseCsvContent(content);
    return rows.map((row) => ({ ...row }));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
};

const writeRows = async (entityName, rows) => {
  await ensureDataDir();
  const filePath = getEntityFilePath(entityName);
  const content = serializeCsvContent(rows);
  await fs.writeFile(filePath, content, 'utf8');
};

const toBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  }
  return Boolean(value);
};

const parseSort = (value) => {
  if (!value) return null;
  const descending = value.startsWith('-');
  return {
    field: descending ? value.slice(1) : value,
    descending,
  };
};

const applyFilters = (rows, filters) => rows.filter((row) => Object.entries(filters).every(([field, filterValue]) => {
  const rowValue = row[field];
  if (rowValue === undefined || rowValue === null || filterValue === undefined || filterValue === null) {
    return rowValue === filterValue;
  }

  if (typeof rowValue === 'number' || typeof filterValue === 'number') {
    return Number(rowValue) === Number(filterValue);
  }

  if (typeof rowValue === 'boolean') {
    return toBoolean(rowValue) === toBoolean(filterValue);
  }

  return String(rowValue).toLowerCase() === String(filterValue).toLowerCase();
}));

export const listEntities = async (entityName, { filters = {}, sort, limit } = {}) => {
  const rows = await readRows(entityName);
  let filtered = applyFilters(rows, filters);

  const parsedSort = parseSort(sort);
  if (parsedSort?.field) {
    filtered = [...filtered].sort((a, b) => {
      const left = a[parsedSort.field];
      const right = b[parsedSort.field];
      const leftValue = left === undefined || left === null ? '' : String(left);
      const rightValue = right === undefined || right === null ? '' : String(right);
      const result = leftValue.localeCompare(rightValue, undefined, { sensitivity: 'base' });
      return parsedSort.descending ? -result : result;
    });
  }

  if (Number.isFinite(Number(limit))) {
    filtered = filtered.slice(0, Number(limit));
  }

  return filtered;
};

export const getEntityById = async (entityName, id) => {
  const rows = await readRows(entityName);
  return rows.find((row) => row.id === id) || null;
};

export const createEntity = async (entityName, payload) => {
  const rows = await readRows(entityName);
  const entity = {
    ...payload,
    id: payload.id || crypto.randomUUID(),
    created_date: payload.created_date || new Date().toISOString(),
    updated_date: payload.updated_date || new Date().toISOString(),
  };

  rows.push(entity);
  await writeRows(entityName, rows);
  return entity;
};

export const updateEntity = async (entityName, id, payload) => {
  const rows = await readRows(entityName);
  const index = rows.findIndex((row) => row.id === id);
  if (index === -1) {
    throw new Error('Entity not found');
  }

  const updated = {
    ...rows[index],
    ...payload,
    id,
    updated_date: new Date().toISOString(),
  };

  rows[index] = updated;
  await writeRows(entityName, rows);
  return updated;
};

export const deleteEntity = async (entityName, id) => {
  const rows = await readRows(entityName);
  const filteredRows = rows.filter((row) => row.id !== id);
  if (filteredRows.length === rows.length) {
    throw new Error('Entity not found');
  }

  await writeRows(entityName, filteredRows);
  return { deleted: true, id };
};
