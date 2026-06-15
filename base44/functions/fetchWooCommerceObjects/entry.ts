import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// The WooCommerce REST API root lists all available namespaces/routes.
// We probe each known top-level resource and verify actual read access.

const KNOWN_ROUTES = [
  { label: "Orders", path: "orders" },
  { label: "Products", path: "products" },
  { label: "Customers", path: "customers" },
  { label: "Coupons", path: "coupons" },
  { label: "Reports", path: "reports" },
  { label: "Tax Rates", path: "taxes" },
  { label: "Tax Classes", path: "taxes/classes" },
  { label: "Shipping Zones", path: "shipping/zones" },
  { label: "Product Categories", path: "products/categories" },
  { label: "Product Tags", path: "products/tags" },
  { label: "Product Attributes", path: "products/attributes" },
  { label: "Order Refunds", path: "orders/refunds" },
  { label: "Payment Gateways", path: "payment_gateways" },
  { label: "System Status", path: "system_status" },
  { label: "Webhooks", path: "webhooks" },
  { label: "Settings", path: "settings" },
  { label: "Data", path: "data" },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { client_id } = await req.json();
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
    const authParams = `consumer_key=${encodeURIComponent(woo_consumer_key)}&consumer_secret=${encodeURIComponent(woo_consumer_secret)}`;
    const headers = { 'User-Agent': woo_user_agent, 'Accept': 'application/json' };

    // Step 1: Fetch the WooCommerce API root to get the declared namespace routes
    let declaredPaths = new Set();
    try {
      const rootRes = await fetch(`${baseUrl}/wp-json/${woo_version}?${authParams}`, { headers });
      if (rootRes.ok) {
        const rootData = await rootRes.json();
        // The root returns { namespace, routes: { "/wc/v3/orders": {...}, ... } }
        if (rootData.routes) {
          for (const routePath of Object.keys(rootData.routes)) {
            // e.g. "/wc/v3/orders" -> "orders"
            const stripped = routePath.replace(`/${woo_version}/`, '').replace(/^\//, '');
            // Only include top-level paths (no /(?P<id>...) patterns, no deep sub-paths beyond one slash)
            if (!stripped.includes('(?P') && stripped.length > 0) {
              declaredPaths.add(stripped);
            }
          }
        }
      }
    } catch (_) {
      // If root probe fails, fall back to probing known routes only
    }

    // Step 2: Build candidate list — union of known routes + anything extra from root discovery
    const extraFromRoot = [];
    for (const p of declaredPaths) {
      const alreadyKnown = KNOWN_ROUTES.some(r => r.path === p);
      if (!alreadyKnown) {
        // Derive a readable label from the path
        const label = p.split('/').map(seg => seg.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())).join(' › ');
        extraFromRoot.push({ label, path: p });
      }
    }
    const candidates = [...KNOWN_ROUTES, ...extraFromRoot];

    // Step 3: Probe each candidate with per_page=1 to confirm real read access
    const accessible = [];
    await Promise.all(candidates.map(async ({ label, path }) => {
      try {
        const url = `${baseUrl}/wp-json/${woo_version}/${path}?${authParams}&per_page=1`;
        const res = await fetch(url, { headers });
        if (res.status === 200 || res.status === 204) {
          // Confirm it's actually JSON (not an HTML error page)
          const ct = res.headers.get('content-type') || '';
          if (ct.includes('json')) {
            accessible.push({ label, path });
          }
        }
      } catch (_) {
        // Not accessible — skip
      }
    }));

    // Sort: put discovered-from-root paths first if not in KNOWN_ROUTES, otherwise keep KNOWN_ROUTES order
    accessible.sort((a, b) => {
      const ai = KNOWN_ROUTES.findIndex(r => r.path === a.path);
      const bi = KNOWN_ROUTES.findIndex(r => r.path === b.path);
      if (ai === -1 && bi === -1) return a.label.localeCompare(b.label);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

    return Response.json({ objects: accessible });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});