const buildAuthHeaders = (authType, authValue, headerName) => {
  if (!authValue) return {};
  switch ((authType || '').replace(/\s+/g, '').toLowerCase()) {
    case 'bearertoken':
    case 'oauth2':
      return { Authorization: `Bearer ${authValue}` };
    case 'apikeyheader':
    case 'apikey':
      return { [headerName || 'X-API-Key']: authValue };
    default:
      return {};
  }
};

// Extract an array of records from various common API response shapes.
const extractRecords = (data) => {
  if (Array.isArray(data)) return data;
  for (const key of ['data', 'results', 'items', 'records', 'contacts', 'leads', 'orders', 'customers']) {
    if (Array.isArray(data[key])) return data[key];
  }
  return [data];
};

export const fetchGenericApiData = async (fields = {}, syncJob = {}) => {
  const endpoint = syncJob.api_endpoint || fields.api_base_url;
  if (!endpoint) throw new Error('No API endpoint configured. Set the endpoint in the pipeline API Configuration section.');

  // Use job-level auth if set, otherwise fall back to connection credentials
  const authValue = syncJob.api_auth_value || fields.api_key || fields.access_token || '';
  const authHeaders = buildAuthHeaders(syncJob.api_auth_type, authValue, syncJob.api_auth_header_name);

  const options = {
    method: (syncJob.api_method || 'GET').toUpperCase(),
    headers: { Accept: 'application/json', ...authHeaders },
  };

  if (syncJob.api_request_body && options.method !== 'GET') {
    options.headers['Content-Type'] = 'application/json';
    options.body = syncJob.api_request_body;
  }

  const res = await fetch(endpoint, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  return extractRecords(data);
};
