const BASE_URL = 'https://app.simpli.fi/api';

const simplifiHeaders = (fields) => ({
  'X-App-Key': fields.simplifi_org_key || '',
  'X-User-Key': fields.simplifi_user_key || '',
  'Accept': 'application/json',
  'Content-Type': 'application/json',
});

const simplifiGet = async (fields, path, params = {}) => {
  const url = new URL(`${BASE_URL}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (Array.isArray(v)) {
      v.forEach((item) => url.searchParams.append(`${k}[]`, item));
    } else if (v !== undefined && v !== null) {
      url.searchParams.set(k, String(v));
    }
  });

  const res = await fetch(url.toString(), { headers: simplifiHeaders(fields) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Simplifi API error (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
};

// Verify credentials and return org info (id, name, etc.)
export const testSimplifiConnection = async (fields) => {
  const data = await simplifiGet(fields, '/organizations');
  const orgs = data.organizations || data;
  if (!Array.isArray(orgs) || !orgs.length) {
    throw new Error('No organizations returned — check API keys');
  }
  const org = orgs[0];
  return {
    success: true,
    org_id: org.id,
    org_name: org.name || org.organization?.name,
    message: `Connected — Organization: ${org.name || org.organization?.name || org.id}`,
  };
};

// List campaigns (with optional performance stats)
export const fetchSimplifiCampaigns = async (fields, orgId, options = {}) => {
  const params = {};
  if (options.includeStats) params.include = ['stats'];
  if (options.startDate) params.start_date = options.startDate;
  if (options.endDate) params.end_date = options.endDate;
  if (options.status) params.status = options.status;

  const data = await simplifiGet(fields, `/organizations/${orgId}/campaigns`, params);
  return data.campaigns || data;
};

// List line items for a campaign
export const fetchSimplifiLineItems = async (fields, orgId, campaignId, options = {}) => {
  const params = {};
  if (options.includeStats) params.include = ['stats'];
  const data = await simplifiGet(fields, `/organizations/${orgId}/campaigns/${campaignId}/line_items`, params);
  return data.line_items || data;
};

// List ads for a campaign
export const fetchSimplifiAds = async (fields, orgId, campaignId) => {
  const data = await simplifiGet(fields, `/organizations/${orgId}/campaigns/${campaignId}/ads`);
  return data.ads || data;
};

// Generic endpoint fetch — used by performance sync jobs configured with a custom path
export const fetchSimplifiEndpoint = async (fields, orgId, endpointPath, params = {}) => {
  const resolvedPath = endpointPath.replace('{org_id}', orgId);
  const data = await simplifiGet(fields, resolvedPath, params);
  // Return the first array found in the response, or the response itself
  if (Array.isArray(data)) return data;
  for (const val of Object.values(data)) {
    if (Array.isArray(val)) return val;
  }
  return [data];
};
