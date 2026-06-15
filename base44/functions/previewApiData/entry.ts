import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { client_id, endpoint, method, auth_type, auth_value, auth_header_name, request_body, preview_limit } = body;

    if (!endpoint) return Response.json({ error: 'endpoint is required' }, { status: 400 });

    // Build headers
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };

    if (auth_type === 'Bearer Token' && auth_value) {
      headers['Authorization'] = `Bearer ${auth_value}`;
    } else if (auth_type === 'API Key Header' && auth_value) {
      headers[auth_header_name || 'X-API-Key'] = auth_value;
    } else if (auth_type === 'Basic Auth' && auth_value) {
      headers['Authorization'] = `Basic ${auth_value}`;
    }

    // If we have a client_id with WooCommerce creds, use OAuth1-style query params instead
    let fetchUrl = endpoint;
    if (client_id) {
      const clients = await base44.asServiceRole.entities.Clients.filter({ id: client_id });
      const client = clients[0];
      if (client?.crm_type === 'WooCommerce' && client.woo_consumer_key && client.woo_consumer_secret) {
        const sep = endpoint.includes('?') ? '&' : '?';
        fetchUrl = `${endpoint}${sep}consumer_key=${encodeURIComponent(client.woo_consumer_key)}&consumer_secret=${encodeURIComponent(client.woo_consumer_secret)}&per_page=${preview_limit || 20}`;
        if (client.woo_user_agent) headers['User-Agent'] = client.woo_user_agent;
        delete headers['Authorization'];
      }
    }

    const fetchOpts = { method: method || 'GET', headers };
    if ((method || 'GET') === 'POST' && request_body) {
      fetchOpts.body = typeof request_body === 'string' ? request_body : JSON.stringify(request_body);
    }

    const resp = await fetch(fetchUrl, fetchOpts);
    const text = await resp.text();

    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }

    if (!resp.ok) {
      return Response.json({ error: `API returned ${resp.status}`, detail: typeof parsed === 'string' ? parsed : JSON.stringify(parsed) }, { status: 200 });
    }

    // Normalize to array of records
    let records = [];
    if (Array.isArray(parsed)) {
      records = parsed;
    } else if (parsed && typeof parsed === 'object') {
      // Try common wrapper keys
      const keys = ['data', 'results', 'records', 'items', 'contacts', 'leads', 'orders', 'deals'];
      for (const k of keys) {
        if (Array.isArray(parsed[k])) { records = parsed[k]; break; }
      }
      if (records.length === 0) records = [parsed];
    }

    // Limit preview records
    records = records.slice(0, preview_limit || 20);

    // Detect if an array looks like an array of key-value objects (e.g. line_items)
    const isKVArray = (arr) =>
      Array.isArray(arr) &&
      arr.length > 0 &&
      arr.every(item => item !== null && typeof item === 'object' && !Array.isArray(item));

    // Flatten each record — expanding array-of-objects into prefixed sub-columns
    const flatten = (obj, prefix = '') => {
      const result = {};
      for (const [k, v] of Object.entries(obj || {})) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
          Object.assign(result, flatten(v, key));
        } else if (isKVArray(v)) {
          // Expand first item's keys as sub-columns: line_items_id, line_items_name, etc.
          const first = v[0];
          for (const [subK, subV] of Object.entries(first)) {
            const subKey = `${key}_${subK}`;
            if (subV !== null && typeof subV === 'object' && !Array.isArray(subV)) {
              // one more level for nested objects inside array items
              for (const [subSubK, subSubV] of Object.entries(subV)) {
                result[`${subKey}_${subSubK}`] = Array.isArray(subSubV) ? JSON.stringify(subSubV) : subSubV;
              }
            } else if (Array.isArray(subV)) {
              result[subKey] = JSON.stringify(subV);
            } else {
              result[subKey] = subV;
            }
          }
          // Also store count of items
          result[`${key}_count`] = v.length;
        } else if (Array.isArray(v)) {
          result[key] = JSON.stringify(v);
        } else {
          result[key] = v;
        }
      }
      return result;
    };

    const flatRecords = records.map(r => (typeof r === 'object' && r !== null ? flatten(r) : { value: r }));

    // Collect all column keys in order of first appearance
    const colSet = new Set();
    flatRecords.forEach(r => Object.keys(r).forEach(k => colSet.add(k)));
    const columns = Array.from(colSet);

    return Response.json({ records: flatRecords, columns, total_fetched: records.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});