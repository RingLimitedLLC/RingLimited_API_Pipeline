import sql from 'mssql';
import { config } from '../config.js';

// Parse a full ADO.NET or JDBC-style connection string into mssql config object.
// Expected env var format (ADO.NET):
//   Server=tcp:<server>.database.windows.net,1433;Database=<db>;User Id=<user>;Password=<pass>;Encrypt=true;
const parseConnectionString = (connStr) => {
  const get = (key) => {
    const match = connStr.match(new RegExp(`${key}=([^;]+)`, 'i'));
    return match ? match[1].trim() : '';
  };
  const server = get('Server').replace(/^tcp:/, '').replace(/,\d+$/, '');
  return {
    server,
    database: get('Database'),
    authentication: {
      type: 'default',
      options: {
        userName: get('User Id') || get('Uid'),
        password: get('Password') || get('Pwd'),
      },
    },
    options: {
      encrypt: true,
      trustServerCertificate: false,
      connectTimeout: 30000,
      requestTimeout: 60000,
    },
  };
};

let pool = null;

const getPool = async () => {
  if (pool?.connected) return pool;

  const connStr = config.azureSqlConnectionString;
  if (!connStr) throw new Error('AZURE_SQL_CONNECTION_STRING is not configured in environment');

  const sqlConfig = parseConnectionString(connStr);
  pool = await sql.connect(sqlConfig);
  return pool;
};

// Infer SQL column type from a JS value
const inferSqlType = (value) => {
  if (value === null || value === undefined) return sql.NVarChar(500);
  if (typeof value === 'number') return Number.isInteger(value) ? sql.BigInt : sql.Float;
  if (typeof value === 'boolean') return sql.Bit;
  if (value instanceof Date) return sql.DateTime2;
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2}(T|\s)/.test(str)) return sql.DateTime2;
  return sql.NVarChar(Math.min(Math.max(str.length * 2, 255), 4000));
};

// Ensure table exists with the right columns; add missing columns if schema grows
const ensureTable = async (pool, tableName, sampleRow) => {
  const columns = Object.entries(sampleRow).map(([col, val]) => ({
    name: col.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 128),
    type: inferSqlType(val),
  }));

  // Add internal tracking columns
  const allColumns = [
    { name: '_ingested_at', type: sql.DateTime2 },
    { name: '_source', type: sql.NVarChar(100) },
    ...columns,
  ];

  const colDefs = allColumns
    .map(({ name, type }) => `[${name}] ${type.declaration || 'NVARCHAR(500)'} NULL`)
    .join(',\n  ');

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = '${tableName.replace(/'/g, "''")}'
    )
    CREATE TABLE [${tableName}] (
      [_id] BIGINT IDENTITY(1,1) PRIMARY KEY,
      ${colDefs}
    )
  `);

  // Add any columns that appeared in a newer batch but don't exist yet
  const existing = await pool.request().query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = '${tableName.replace(/'/g, "''")}'
  `);
  const existingNames = new Set(existing.recordset.map((r) => r.COLUMN_NAME));

  for (const { name } of columns) {
    if (!existingNames.has(name)) {
      await pool.request().query(`ALTER TABLE [${tableName}] ADD [${name}] NVARCHAR(500) NULL`);
    }
  }
};

// Append rows to a SQL table. Creates the table if it doesn't exist.
export const appendToSqlTable = async (tableName, rows, source = 'simplifi') => {
  if (!rows.length) return { inserted: 0 };

  const p = await getPool();
  const ingestedAt = new Date();

  // Flatten any object/array values to JSON strings
  const flatRows = rows.map((r) =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => [
        k,
        v !== null && typeof v === 'object' ? JSON.stringify(v) : v,
      ]),
    ),
  );

  await ensureTable(p, tableName, flatRows[0]);

  // Build column list from union of all row keys
  const colNames = [...new Set(flatRows.flatMap((r) => Object.keys(r)))]
    .map((c) => c.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 128));

  let inserted = 0;
  for (const row of flatRows) {
    const req = p.request();
    req.input('_ingested_at', sql.DateTime2, ingestedAt);
    req.input('_source', sql.NVarChar(100), source);

    const valueCols = [];
    for (const col of colNames) {
      const rawKey = Object.keys(row).find((k) => k.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 128) === col);
      const val = rawKey !== undefined ? (row[rawKey] ?? null) : null;
      req.input(col, sql.NVarChar(4000), val !== null ? String(val) : null);
      valueCols.push(col);
    }

    const colList = ['_ingested_at', '_source', ...valueCols].map((c) => `[${c}]`).join(', ');
    const valList = ['@_ingested_at', '@_source', ...valueCols.map((c) => `@${c}`)].join(', ');

    await req.query(`INSERT INTO [${tableName}] (${colList}) VALUES (${valList})`);
    inserted++;
  }

  return { inserted };
};

export const testSqlConnection = async () => {
  const p = await getPool();
  const result = await p.request().query('SELECT GETDATE() AS now, @@VERSION AS version');
  return { connected: true, serverTime: result.recordset[0].now };
};
