import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Detect array-of-objects (key-value list pattern)
function isKVArray(arr) {
  return Array.isArray(arr) &&
    arr.length > 0 &&
    arr.every(item => item !== null && typeof item === "object" && !Array.isArray(item));
}

// Flatten a nested object into field name list, expanding array-of-objects into sub-fields.
// Returns { keys: string[], expandedFields: Set<string>, arraySources: string[] }
function flattenKeys(obj, prefix = "", expandedFields = new Set(), arraySources = []) {
  const keys = [];
  for (const key of Object.keys(obj || {})) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const val = obj[key];
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      keys.push(...flattenKeys(val, fullKey, expandedFields, arraySources).keys);
    } else if (isKVArray(val)) {
      // Track the original array field name
      if (!prefix) arraySources.push(fullKey);
      const first = val[0];
      for (const [subK, subV] of Object.entries(first)) {
        const subKey = `${fullKey}_${subK}`;
        if (subV !== null && typeof subV === "object" && !Array.isArray(subV)) {
          for (const subSubK of Object.keys(subV)) {
            const leaf = `${subKey}_${subSubK}`;
            keys.push(leaf);
            expandedFields.add(leaf);
          }
        } else {
          keys.push(subKey);
          expandedFields.add(subKey);
        }
      }
      const countKey = `${fullKey}_count`;
      keys.push(countKey);
      expandedFields.add(countKey);
    } else {
      keys.push(fullKey);
    }
  }
  return { keys, expandedFields, arraySources };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      client_id,
      woo_page = "orders",
      date_filter_type,
      date_filter_field,
      date_filter_relative_days,
      date_filter_start,
      date_filter_end,
    } = await req.json();
    if (!client_id) {
      return Response.json({ error: 'client_id is required' }, { status: 400 });
    }

    const client = await base44.entities.Clients.get(client_id);
    if (!client) {
      return Response.json({ error: 'Client not found' }, { status: 404 });
    }

    const {
      api_base_url,
      woo_consumer_key,
      woo_consumer_secret,
      woo_version = 'wc/v3',
      woo_user_agent = 'RingAPI/1.0',
    } = client;

    if (!api_base_url || !woo_consumer_key || !woo_consumer_secret) {
      return Response.json({ error: 'Missing WooCommerce credentials on this client' }, { status: 400 });
    }

    const baseUrl = api_base_url.replace(/\/$/, '');
    const url = new URL(`${baseUrl}/wp-json/${woo_version}/${woo_page}`);
    url.searchParams.set('consumer_key', woo_consumer_key);
    url.searchParams.set('consumer_secret', woo_consumer_secret);
    url.searchParams.set('per_page', '5'); // fetch a few records for a better preview

    // Apply date filters if configured
    if (date_filter_type === 'relative' && date_filter_field && date_filter_relative_days) {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - Number(date_filter_relative_days));
      const afterStr = daysAgo.toISOString().slice(0, 10);
      // WooCommerce uses "after" / "before" params for date filtering on most endpoints
      url.searchParams.set('after', afterStr);
    } else if (date_filter_type === 'absolute' && date_filter_start) {
      url.searchParams.set('after', date_filter_start);
      if (date_filter_end) {
        url.searchParams.set('before', date_filter_end);
      }
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': woo_user_agent,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.text();
      return Response.json({ error: `WooCommerce API error (${response.status}): ${body.slice(0, 300)}` }, { status: 502 });
    }

    const data = await response.json();
    const records = Array.isArray(data) ? data : (data.orders || data.products || data.customers || []);

    if (records.length === 0) {
      return Response.json({ fields: [], sample: null, message: 'No records found to infer schema from' });
    }

    const firstRecord = records[0];
    const expandedFields = new Set();
    const arraySources = [];
    const { keys: fields } = flattenKeys(firstRecord, "", expandedFields, arraySources);

    // Flatten all returned records for the preview table
    function flattenRecord(obj, prefix = "") {
      const out = {};
      for (const key of Object.keys(obj || {})) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        const val = obj[key];
        if (val !== null && typeof val === "object" && !Array.isArray(val)) {
          Object.assign(out, flattenRecord(val, fullKey));
        } else if (isKVArray(val)) {
          const first = val[0];
          for (const [subK, subV] of Object.entries(first)) {
            const subKey = `${fullKey}_${subK}`;
            if (subV !== null && typeof subV === "object" && !Array.isArray(subV)) {
              for (const [subSubK, subSubV] of Object.entries(subV)) {
                out[`${subKey}_${subSubK}`] = subSubV;
              }
            } else {
              out[subKey] = subV;
            }
          }
          out[`${fullKey}_count`] = val.length;
        } else {
          out[fullKey] = val;
        }
      }
      return out;
    }

    const flatRecords = records.map(r => flattenRecord(r));

    return Response.json({
      fields,
      expanded_fields: Array.from(expandedFields),
      array_source_fields: arraySources,
      sample: firstRecord,
      flat_records: flatRecords,
      total: records.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});