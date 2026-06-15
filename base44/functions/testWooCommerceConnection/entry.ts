import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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
      return Response.json({ error: 'Missing required WooCommerce credentials (URL, consumer key, consumer secret)' }, { status: 400 });
    }

    // Build the endpoint URL with basic auth credentials as query params (WooCommerce standard)
    const baseUrl = api_base_url.replace(/\/$/, '');
    const url = new URL(`${baseUrl}/wp-json/${woo_version}/`);
    url.searchParams.set('consumer_key', woo_consumer_key);
    url.searchParams.set('consumer_secret', woo_consumer_secret);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': woo_user_agent,
        'Accept': 'application/json',
      },
    });

    const status = response.ok ? 'Connected' : 'Error';
    const body = await response.text();

    // Update connection status on the client record
    await base44.entities.Clients.update(client_id, { connection_status: status });

    return Response.json({
      success: response.ok,
      status_code: response.status,
      connection_status: status,
      response_preview: body.slice(0, 300),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});