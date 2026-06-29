/**
 * Universal record flattening utilities.
 *
 * Used by every outbound connector (WooCommerce, generic API, etc.) to turn
 * nested API responses into flat column lists for the field browser and CSV
 * export. Three shapes are handled:
 *
 *   Plain objects   { billing: { first_name: "Jane" } }
 *     → billing.first_name = "Jane"
 *
 *   Key-value arrays  [ { key: "_email", value: "j@x.com" }, ... ]
 *     → parent._email = "j@x.com"
 *     (WooCommerce meta_data, Shopify metafields, HubSpot property lists, etc.)
 *
 *   Generic arrays of objects  [ { name: "A", qty: 2 }, { name: "B", qty: 1 } ]
 *     → parent.name = "A; B",  parent.qty = "2; 1"
 */

/**
 * Detects whether an array uses the key-value-pair pattern:
 * every sampled element has a `key` (or `name`) field plus a `value` field.
 * This covers WooCommerce meta_data, Shopify metafields, and similar.
 */
export const isKvArray = (arr) => {
  if (!Array.isArray(arr) || arr.length < 1) return false;
  const sample = arr.slice(0, Math.min(arr.length, 5));
  return sample.every(
    (el) => el && typeof el === 'object' && ('key' in el || 'name' in el) && 'value' in el,
  );
};

/**
 * Collect all dot-notation field paths from a nested object.
 * KV arrays are pivoted so each unique key becomes a sub-column.
 * Generic object arrays are merged and recursed.
 */
export const flattenKeys = (obj, prefix = '', depth = 0) => {
  if (depth > 4) return prefix ? [prefix] : [];
  const keys = [];
  for (const [k, v] of Object.entries(obj || {})) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, fullKey, depth + 1));
    } else if (isKvArray(v)) {
      // KV pivot — each element's key becomes a sub-column
      const seen = new Set();
      for (const el of v) {
        const kvKey = el.key ?? el.name;
        if (!kvKey || seen.has(kvKey)) continue;
        seen.add(kvKey);
        const subKey = `${fullKey}.${kvKey}`;
        const val = el.value;
        if (val !== null && val !== undefined && typeof val === 'object' && !Array.isArray(val)) {
          keys.push(...flattenKeys(val, subKey, depth + 1));
        } else {
          keys.push(subKey);
        }
      }
    } else if (Array.isArray(v) && v.length > 0 && v[0] !== null && typeof v[0] === 'object') {
      // Generic array of objects — merge all element shapes and recurse
      const merged = v.reduce((acc, item) => {
        if (item && typeof item === 'object') Object.assign(acc, item);
        return acc;
      }, {});
      keys.push(...flattenKeys(merged, fullKey, depth + 1));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
};

/**
 * Flatten a nested record into a single-level object keyed by dot-notation paths.
 * KV arrays are pivoted; generic object arrays are joined with "; ".
 * Used for the field browser preview rows only — the executor reads raw records.
 */
export const flattenRecord = (obj, prefix = '', depth = 0) => {
  if (depth > 4) return prefix ? { [prefix]: typeof obj === 'object' ? '[nested]' : obj } : {};
  const result = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(result, flattenRecord(v, fullKey, depth + 1));
    } else if (isKvArray(v)) {
      // KV pivot — create one column per unique key, value is the cell
      const seen = new Set();
      for (const el of v) {
        const kvKey = el.key ?? el.name;
        if (!kvKey || seen.has(kvKey)) continue;
        seen.add(kvKey);
        const subKey = `${fullKey}.${kvKey}`;
        const val = el.value;
        if (val !== null && val !== undefined && typeof val === 'object' && !Array.isArray(val)) {
          Object.assign(result, flattenRecord(val, subKey, depth + 1));
        } else if (Array.isArray(val)) {
          result[subKey] = val
            .map((i) => (typeof i === 'object' && i !== null ? JSON.stringify(i) : String(i ?? '')))
            .join('; ');
        } else {
          result[subKey] = val ?? '';
        }
      }
    } else if (Array.isArray(v) && v.length > 0 && v[0] !== null && typeof v[0] === 'object') {
      // Generic array of objects — collect each sub-field from all elements, join
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
      result[fullKey] = Array.isArray(v)
        ? v.map((i) => (typeof i === 'object' && i !== null ? JSON.stringify(i) : String(i ?? ''))).join('; ')
        : v;
    }
  }
  return result;
};

/**
 * Resolve a dot-notation path against a nested object at pipeline run time.
 * Mirrors the three shapes handled by flattenRecord so selected field paths
 * always produce the same values in the CSV as in the browser preview.
 *
 *   getNestedValue(record, "billing.first_name")   → "Jane"
 *   getNestedValue(record, "meta_data._email")      → "j@x.com"   (KV pivot)
 *   getNestedValue(record, "line_items.name")       → "A; B"      (generic array)
 */
export const getNestedValue = (obj, path) => {
  const parts = String(path).split('.');
  let cur = obj;
  for (let i = 0; i < parts.length; i++) {
    if (cur == null) return '';
    if (Array.isArray(cur)) {
      if (isKvArray(cur)) {
        // KV pivot: look up by the key field, return the matching value
        const kvKey = parts[i];
        const el = cur.find((item) => item.key === kvKey || item.name === kvKey);
        if (!el) return '';
        const val = el.value;
        // If more path parts remain, recurse into the value object
        if (i + 1 < parts.length) return getNestedValue(val, parts.slice(i + 1).join('.'));
        if (val === null || val === undefined) return '';
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
      } else {
        // Generic array: collect the remaining path from every element, join
        const remaining = parts.slice(i).join('.');
        const values = cur
          .map((item) => {
            const v = getNestedValue(item, remaining);
            return v !== null && v !== undefined && v !== '' ? String(v) : null;
          })
          .filter((v) => v !== null);
        return values.join('; ');
      }
    }
    if (typeof cur !== 'object') return '';
    cur = cur[parts[i]];
  }
  if (cur !== null && typeof cur === 'object') return JSON.stringify(cur);
  return cur ?? '';
};
