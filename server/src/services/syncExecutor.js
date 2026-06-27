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

const applyFieldSelection = (records, selectedFields, fieldMappings) => {
  if (!selectedFields || !selectedFields.length) {
    // No field selection — return records as-is (flattened one level)
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

export const runSyncJob = async (syncJobId, connectionId) => {
  const syncJob = await getEntityById('SyncJobs', syncJobId);
  if (!syncJob) throw new Error(`SyncJob ${syncJobId} not found`);

  // SyncJob.client_id stores the connection ID (legacy naming from before refactor)
  const effectiveConnectionId = connectionId || syncJob.client_id;
  const connection = await getEntityById('Connections', effectiveConnectionId);
  if (!connection) throw new Error(`Connection ${effectiveConnectionId} not found`);

  const credentials = await getConnectionCredentials(connection);
  if (!credentials.configured) {
    throw new Error(`Credentials not configured for this connection: ${credentials.message}`);
  }

  const fields = credentials.fields;
  const connectionType = credentials.connectionType?.id || connection.connection_type;
  const dateFilter = buildDateFilter(syncJob);
  const startedAt = new Date().toISOString();

  let status = 'Failed';
  let errorMessage = '';
  let recordCount = 0;
  let result = null;

  try {
    let rawRecords = [];

    if (connectionType === 'woocommerce') {
      const endpoint = syncJob.object_type === 'Custom'
        ? (syncJob.custom_object_name || 'orders')
        : (syncJob.object_type || 'orders').toLowerCase();

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

    const processed = applyFieldSelection(rawRecords, syncJob.selected_fields, syncJob.field_mappings);
    const csvContent = toCsv(processed);

    const folderPath = connection.sharepoint_folder_path || '';
    const folderItemId = connection.sharepoint_folder_id || '';
    const filename = `${syncJob.sharepoint_filename || syncJob.job_name.replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`;

    const writeResult = await writeFileToFolder(folderItemId, folderPath, filename, csvContent);

    recordCount = processed.length;
    status = 'Success';
    result = {
      success: true,
      records_processed: recordCount,
      filename,
      folder: folderPath,
      sharepoint_url: writeResult.webUrl,
    };
  } catch (err) {
    errorMessage = err.message;
    status = 'Failed';
  }

  const finishedAt = new Date().toISOString();

  // Write sync log (best-effort — don't let log failure mask the sync error)
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
  }).catch((e) => console.error('[SyncExecutor] Failed to update SyncJob:', e.message));

  if (status === 'Success') {
    updateEntity('Connections', connection.id, {
      last_sync_at: finishedAt,
      connection_status: 'Connected',
    }).catch((e) => console.error('[SyncExecutor] Failed to update Connection:', e.message));
  }

  if (status === 'Failed') {
    throw new Error(errorMessage);
  }

  return result;
};
