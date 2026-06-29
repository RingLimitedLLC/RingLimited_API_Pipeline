const buildAuth = (consumerKey, consumerSecret) =>
  `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')}`;

const buildBaseUrl = (storeUrl, version = 'wc/v3') =>
  `${String(storeUrl).replace(/\/$/, '')}/wp-json/${version}`;

// Flatten a nested object into dot-notation keys (e.g. billing.first_name).
// Arrays of objects are unrolled: each sub-key becomes parent.subKey.
// Arrays of primitives stay as a single leaf key.
const flattenKeys = (obj, prefix = '', depth = 0) => {
  if (depth > 4) return prefix ? [prefix] : [];
  const keys = [];
  for (const [k, v] of Object.entries(obj || {})) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v)) {
      // Plain nested object — recurse
      keys.push(...flattenKeys(v, fullKey, depth + 1));
    } else if (Array.isArray(v) && v.length > 0 && v[0] !== null && typeof v[0] === 'object') {
      // Array of objects — merge all element shapes so every sub-key is discovered,
      // then recurse into the merged shape to produce parent.subKey columns.
      const merged = v.reduce((acc, item) => {
        if (item && typeof item === 'object') Object.assign(acc, item);
        return acc;
      }, {});
      keys.push(...flattenKeys(merged, fullKey, depth + 1));
    } else {
      // Primitive, empty array, or array of primitives — single leaf
      keys.push(fullKey);
    }
  }
  return keys;
};

// Flatten a nested object into a single-level object keyed by dot-notation paths.
// Arrays of objects are unrolled: values from all elements are joined with "; ".
const flattenRecord = (obj, prefix = '', depth = 0) => {
  if (depth > 4) return prefix ? { [prefix]: typeof obj === 'object' ? '[nested]' : obj } : {};
  const result = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v)) {
      // Plain nested object — recurse
      Object.assign(result, flattenRecord(v, fullKey, depth + 1));
    } else if (Array.isArray(v) && v.length > 0 && v[0] !== null && typeof v[0] === 'object') {
      // Array of objects — collect every sub-key from every element; join values with "; "
      const subKeys = [...new Set(v.flatMap((item) =>
        (item && typeof item === 'object' ? Object.keys(item) : []),
      ))];
      for (const subK of subKeys) {
        const subFullKey = `${fullKey}.${subK}`;
        const subValues = v
          .map((item) => {
            const val = item?.[subK];
            if (val === null || val === undefined) return null;
            if (typeof val === 'object') return JSON.stringify(val);
            return String(val);
          })
          .filter((s) => s !== null && s !== '');
        result[subFullKey] = subValues.join('; ');
      }
    } else {
      // Primitive or array of primitives
      result[fullKey] = Array.isArray(v)
        ? v.map((i) => (typeof i === 'object' && i !== null ? JSON.stringify(i) : String(i ?? ''))).join('; ')
        : v;
    }
  }
  return result;
};

export const testWooCommerceConnection = async ({ woo_login_url, woo_consumer_key, woo_consumer_secret, woo_version = 'wc/v3' }) => {
  const baseUrl = buildBaseUrl(woo_login_url, woo_version);
  const auth = buildAuth(woo_consumer_key, woo_consumer_secret);

  const res = await fetch(`${baseUrl}/orders?per_page=1`, {
    headers: { Authorization: auth, Accept: 'application/json' },
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(`WooCommerce auth failed (${res.status}). Check consumer key and secret.`);
  }
  if (res.status === 404) {
    throw new Error(`WooCommerce API not found at ${woo_login_url}. Verify the store URL and that WooCommerce REST API is enabled.`);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WooCommerce API error (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const count = Array.isArray(data) ? data.length : 1;
  const total = res.headers.get('x-wp-total');
  return { ok: true, count, total: total ? Number(total) : null, message: 'WooCommerce connection verified' };
};

const KNOWN_ENDPOINTS = [
  { label: 'Orders', path: 'orders' },
  { label: 'Customers', path: 'customers' },
  { label: 'Products', path: 'products' },
  { label: 'Product Categories', path: 'products/categories' },
  { label: 'Coupons', path: 'coupons' },
];

export const fetchWooCommerceObjects = async ({ woo_login_url, woo_consumer_key, woo_consumer_secret, woo_version = 'wc/v3' }) => {
  const baseUrl = buildBaseUrl(woo_login_url, woo_version);
  const auth = buildAuth(woo_consumer_key, woo_consumer_secret);

  const available = [];
  await Promise.allSettled(
    KNOWN_ENDPOINTS.map(async (endpoint) => {
      const res = await fetch(`${baseUrl}/${endpoint.path}?per_page=1`, {
        headers: { Authorization: auth, Accept: 'application/json' },
      });
      if (res.ok) available.push(endpoint);
    }),
  );

  // Preserve defined order
  return KNOWN_ENDPOINTS.filter((e) => available.some((a) => a.path === e.path));
};

export const fetchWooCommerceSchema = async (
  { woo_login_url, woo_consumer_key, woo_consumer_secret, woo_version = 'wc/v3' },
  endpoint,
  { includeSample = false, dateAfter, dateBefore, sampleSize = 10 } = {},
) => {
  const baseUrl = buildBaseUrl(woo_login_url, woo_version);
  const auth = buildAuth(woo_consumer_key, woo_consumer_secret);

  const params = new URLSearchParams({ per_page: String(includeSample ? sampleSize : 1) });
  if (dateAfter) params.set('after', dateAfter);
  if (dateBefore) params.set('before', dateBefore);

  const res = await fetch(`${baseUrl}/${endpoint}?${params}`, {
    headers: { Authorization: auth, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`WooCommerce schema fetch failed (${res.status})`);

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    return { fields: [], flat_records: [], message: 'No records found; schema could not be derived' };
  }

  const fields = flattenKeys(data[0]);
  const flat_records = data.map((record) => flattenRecord(record));
  return { fields, flat_records, message: `Schema derived from ${data.length} live ${endpoint} records` };
};

export const fetchWooCommerceData = async (
  { woo_login_url, woo_consumer_key, woo_consumer_secret, woo_version = 'wc/v3' },
  endpoint,
  { dateAfter, dateBefore, maxRecords = 10000 } = {},
) => {
  const baseUrl = buildBaseUrl(woo_login_url, woo_version);
  const auth = buildAuth(woo_consumer_key, woo_consumer_secret);

  const records = [];
  let page = 1;
  let totalPages = 1;

  do {
    const params = new URLSearchParams({ per_page: '100', page: String(page), orderby: 'id', order: 'asc' });
    if (dateAfter) params.set('after', dateAfter);
    if (dateBefore) params.set('before', dateBefore);

    const res = await fetch(`${baseUrl}/${endpoint}?${params}`, {
      headers: { Authorization: auth, Accept: 'application/json' },
    });

    if (res.status === 401 || res.status === 403) throw new Error('WooCommerce auth failed. Check consumer key and secret.');
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`WooCommerce API error (${res.status}): ${body.slice(0, 200)}`);
    }

    totalPages = parseInt(res.headers.get('x-wp-totalpages') || '1', 10);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    records.push(...data);
    page++;

    if (records.length >= maxRecords) {
      console.warn(`[WooCommerce] Reached ${maxRecords} record cap — stopping pagination early`);
      break;
    }
  } while (page <= totalPages);

  return records;
};
