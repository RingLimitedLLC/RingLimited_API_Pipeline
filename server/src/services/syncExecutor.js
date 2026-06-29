import { getEntityById, createEntity, updateEntity } from './entityStore.js';
import { getConnectionCredentials } from './onePasswordService.js';
import { fetchWooCommerceData } from './wooCommerceService.js';
import { fetchGenericApiData } from './genericApiService.js';
import { writeFileToFolder } from './sharepointService.js';

// Resolve a dot-notation path against a nested object (e.g. "billing.first_name").
const getNestedValue = (obj, path) => {
  const parts = String(path).split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return '';
    cur = cur[part];
  }
  return cur ?? '';
};

const csvEscape = (value) => {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const toCsv = (rows) => {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  return [
    headers.map(csvEscape).join(','),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(',')),
  ].join('\n');
};

const matchesFilter = (record, { field, operator, value }) => {
  const fieldVal = getNestedValue(record, field);
  const strVal = String(fieldVal ?? '').toLowerCase().trim();
  const filterVal = String(value ?? '').toLowerCase().trim();
  switch (operator) {
    case 'equals':       return strVal === filterVal;
    case 'not_equals':   return strVal !== filterVal;
    case 'contains':     return strVal.includes(filterVal);
    case 'not_contains': return !strVal.includes(filterVal);
    case 'starts_with':  return strVal.startsWith(filterVal);
    case 'greater_than': return Number(fieldVal) > Number(value);
    case 'less_than':    return Number(fieldVal) < Number(value);
    case 'is_empty':     return fieldVal === null || fieldVal === undefined || strVal === '';
    case 'is_not_empty': return fieldVal !== null && fieldVal !== undefined && strVal !== '';
    default:             return true;
  }
};

const applyRecordFilters = (records, filters) => {
  const active = (filters || []).filter((f) => f.field && f.operator);
  if (!active.length) return records;
  return records.filter((record) => active.every((filter) => matchesFilter(record, filter)));
};

const applyFieldSelection = (records, selectedFields, fieldMappings) => {
  if (!selectedFields || !selectedFields.length) {
    return records;
  }
  const mapLookup = Object.fromEntries(
    (fieldMappings || []).map((m) => [m.source, m.destination || m.source]),
  );
  return records.map((r) => {
    const out = {};
    for (const field of selectedFields) {
      const destName = mapLookup[field] || field;
      out[destName] = getNestedValue(r, field);
    }
    return out;
  });
};

const buildDateFilter = (syncJob) => {
  if (!syncJob.date_filter_type || syncJob.date_filter_type === 'none') return {};
  if (syncJob.date_filter_type === 'relative') {
    const days = Number(syncJob.date_filter_relative_days) || 30;
    const after = new Date(Date.now() - days * 86_400_000).toISOString();
    return { dateAfter: after };
  }
  if (syncJob.date_filter_type === 'absolute') {
    return {
      dateAfter: syncJob.date_filter_start ? new Date(syncJob.date_filter_start).toISOString() : undefined,
      dateBefore: syncJob.date_filter_end ? new Date(syncJob.date_filter_end).toISOString() : undefined,
    };
  }
  return {};
};

// Always returns a result object — never throws. Errors are in { success: false, message }.
// This lets the HTTP handler always return 200 so the client doesn't depend on 4xx/5xx behaviour.
export const runSyncJob = async (syncJobId, connectionId) => {
  const startedAt = new Date().toISOString();
  let syncJob = null;
  let connection = null;
  let status = 'Failed';
  let errorMessage = '';
  let recordCount = 0;
  let result = null;

  try {
    // ── Step 1: load entities ────────────────────────────────────────────────
    console.log(`[SyncExecutor] Job ${syncJobId} starting`);
    syncJob = await getEntityById('SyncJobs', syncJobId);
    if (!syncJob) throw new Error(`SyncJob "${syncJobId}" not found in database`);

    const effectiveConnectionId = connectionId || syncJob.client_id;
    connection = await getEntityById('Connections', effectiveConnectionId);
    if (!connection) throw new Error(`Connection "${effectiveConnectionId}" not found`);

    // ── Step 2: credentials ──────────────────────────────────────────────────
    console.log(`[SyncExecutor] Fetching credentials for connection ${connection.id}`);
    const credentials = await getConnectionCredentials(connection);
    if (!credentials.configured) {
      throw new Error(`Credentials not configured for this connection: ${credentials.message}`);
    }

    const fields = credentials.fields;
    const connectionType = credentials.connectionType?.id || connection.connection_type;
    const dateFilter = buildDateFilter(syncJob);
    console.log(`[SyncExecutor] type=${connectionType} dateFilter=${JSON.stringify(dateFilter)}`);

    // ── Step 3: fetch data ───────────────────────────────────────────────────
    let rawRecords = [];

    if (connectionType === 'woocommerce') {
      const GENERIC_CRM_TYPES = new Set(['leads', 'contacts', 'deals', 'companies', 'conversions']);
      const rawType = (syncJob.object_type || 'orders').toLowerCase();
      if (GENERIC_CRM_TYPES.has(rawType)) {
        throw new Error(
          `CRM Object "${syncJob.object_type}" is not a valid WooCommerce endpoint. ` +
          `Edit this pipeline and select a WooCommerce object (Orders, Customers, Products, etc.) from the CRM Object dropdown.`,
        );
      }
      const endpoint = syncJob.object_type === 'Custom'
        ? (syncJob.custom_object_name || 'orders')
        : rawType;

      console.log(`[SyncExecutor] Fetching WooCommerce /${endpoint}...`);
      rawRecords = await fetchWooCommerceData(
        { ...fields, woo_version: connection.woo_version || 'wc/v3' },
        endpoint,
        dateFilter,
      );
    } else if (connectionType === 'generic_api_key' || connectionType === 'generic_oauth2') {
      rawRecords = await fetchGenericApiData(fields, syncJob);
    } else {
      throw new Error(`Connection type "${connectionType}" does not support outbound data pull`);
    }

    console.log(`[SyncExecutor] Fetched ${rawRecords.length} raw records`);

    // ── Step 4: filter + select fields ───────────────────────────────────────
    const filteredRecords = applyRecordFilters(rawRecords, syncJob.record_filters);
    console.log(`[SyncExecutor] After record filters: ${filteredRecords.length} records`);

    const processed = applyFieldSelection(filteredRecords, syncJob.selected_fields, syncJob.field_mappings);
    recordCount = processed.length;
    const csvContent = toCsv(processed);

    // ── Step 5: build filename ────────────────────────────────────────────────
    // Look up the Client entity so we get the real name (Connection doesn't mirror it)
    const clientEntity = connection.client_id
      ? await getEntityById('Clients', connection.client_id).catch(() => null)
      : null;
    const clientName = clientEntity?.client_name || connection.client_name || 'Client';

    const typePrefix = syncJob.job_type === 'Target' ? 'T' : syncJob.job_type === 'Suppression' ? 'S' : 'C';

    // Use datetime stamp when this pipeline runs more than once per day
    const isMultiDaily =
      syncJob.frequency_type === 'interval' &&
      (syncJob.interval_unit === 'minutes' ||
        (syncJob.interval_unit === 'hours' && Number(syncJob.interval_value || 1) < 24));
    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const runDate = isMultiDaily
      ? `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}_${pad(now.getMinutes())}`
      : now.toISOString().slice(0, 10);

    const filename = `${typePrefix}_X_${clientName}_${runDate}_${syncJob.job_name || 'job'}.csv`;

    // ── Step 6: write to SharePoint ──────────────────────────────────────────
    // Folder ID + path live on the SyncJob. Fall back to Connection for pipelines
    // created before this architecture change.
    const writeToSharePoint = syncJob.output_sharepoint !== false;
    const folderItemId = syncJob.sharepoint_folder_id || connection.sharepoint_folder_id || '';
    const folderPath = syncJob.sharepoint_folder_path || connection.sharepoint_folder_path || '';

    let sharepointUrl = null;

    if (writeToSharePoint) {
      if (!folderItemId && !folderPath) {
        throw new Error(
          'No SharePoint output folder configured for this pipeline. ' +
          'Open the pipeline settings and set a destination folder in the Output Destinations section.',
        );
      }
      console.log(`[SyncExecutor] Writing ${recordCount} records → ${filename} (folder: ${folderPath || folderItemId})`);
      const writeResult = await writeFileToFolder(folderItemId, folderPath, filename, csvContent);
      sharepointUrl = writeResult.webUrl;
      console.log(`[SyncExecutor] SharePoint write OK: ${sharepointUrl}`);
    }

    status = 'Success';
    result = {
      success: true,
      records_fetched: rawRecords.length,
      records_after_filter: filteredRecords.length,
      records_processed: recordCount,
      filename,
      ...(writeToSharePoint && { folder: folderPath, sharepoint_url: sharepointUrl }),
    };
  } catch (err) {
    errorMessage = err.message;
    status = 'Failed';
    console.error(`[SyncExecutor] FAILED: ${err.message}`);
  }

  // ── Write SyncLog (best-effort; needs both entities loaded) ─────────────────
  const finishedAt = new Date().toISOString();

  if (syncJob && connection) {
    createEntity('SyncLogs', {
      client_id: connection.client_id,
      connection_id: connection.id,
      sync_job_id: syncJob.id,
      job_name: syncJob.job_name,
      sync_type: 'Manual',
      status,
      records_processed: recordCount,
      error_message: errorMessage,
      started_at: startedAt,
      finished_at: finishedAt,
    }).catch((e) => console.error('[SyncExecutor] Failed to write SyncLog:', e.message));

    updateEntity('SyncJobs', syncJobId, {
      last_run_at: finishedAt,
      last_run_status: status,
      last_error_message: status === 'Failed' ? errorMessage : '',
    }).catch((e) => console.error('[SyncExecutor] Failed to update SyncJob:', e.message));

    if (status === 'Success') {
      updateEntity('Connections', connection.id, {
        last_sync_at: finishedAt,
        connection_status: 'Connected',
      }).catch((e) => console.error('[SyncExecutor] Failed to update Connection:', e.message));
    }
  }

  if (status === 'Failed') {
    return { success: false, message: errorMessage };
  }

  return result;
};
