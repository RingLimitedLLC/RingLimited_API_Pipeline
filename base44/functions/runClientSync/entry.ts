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

    const clients = await base44.asServiceRole.entities.Clients.filter({ id: client_id });
    const client = clients[0];
    if (!client) {
      return Response.json({ error: 'Client not found' }, { status: 404 });
    }

    // Simulate the CRM API call / sync
    await new Promise(r => setTimeout(r, 1000));
    const records = Math.floor(Math.random() * 50) + 5;
    const success = Math.random() > 0.15;

    await base44.asServiceRole.entities.SyncLogs.create({
      client_id: client.id,
      sync_type: "Scheduled",
      status: success ? "Success" : "Failed",
      records_processed: success ? records : 0,
      error_message: success ? "" : "Timeout connecting to CRM API",
    });

    await base44.asServiceRole.entities.Clients.update(client.id, {
      last_sync_at: new Date().toISOString(),
      connection_status: success ? "Connected" : "Error",
    });

    return Response.json({
      success,
      client_id: client.id,
      records_processed: success ? records : 0,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});