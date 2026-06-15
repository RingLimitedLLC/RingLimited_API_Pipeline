import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Retries a failed SharePoint delivery log entry.
 * It re-reads the original log details and attempts a fresh delivery
 * of a CSV with the same metadata. Since we don't store the original
 * records, this creates a retry marker file so the data team knows
 * to re-push. For actual record re-delivery, clients should re-POST
 * to the inboundPush endpoint.
 *
 * Payload: { log_id: string, client_id: string }
 */

function sanitizePathSegment(name) {
  return (name || "").replace(/[\\/:*?"<>|#%]/g, "_").trim();
}

async function getTenantHost(accessToken) {
  const res = await fetch("https://graph.microsoft.com/v1.0/sites/root", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error(`Failed to resolve SharePoint tenant: ${res.status}`);
  const data = await res.json();
  return data.siteCollection?.hostname || new URL(data.webUrl).hostname;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { log_id, client_id } = await req.json();
    if (!log_id || !client_id) {
      return Response.json({ error: "log_id and client_id are required" }, { status: 400 });
    }

    // Fetch the original log and client
    const [logs, clients] = await Promise.all([
      base44.asServiceRole.entities.AlteryxDeliveryLog.filter({ id: log_id }),
      base44.asServiceRole.entities.Clients.filter({ id: client_id }),
    ]);

    const log = logs[0];
    const client = clients[0];

    if (!log) return Response.json({ error: "Log entry not found" }, { status: 404 });
    if (!client) return Response.json({ error: "Client not found" }, { status: 404 });

    // Get SharePoint connection
    const { accessToken } = await base44.asServiceRole.connectors.getConnection("share_point");
    const tenantHost = await getTenantHost(accessToken);

    const siteRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${tenantHost}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!siteRes.ok) throw new Error(`SharePoint root site not found (${siteRes.status})`);
    const site = await siteRes.json();
    const siteId = site.id;

    // Build a retry marker file at the same path
    const safeClient = sanitizePathSegment(client.client_name);
    const retryFilename = `RETRY_REQUESTED_${log.batch_id || log_id}_${Date.now()}.txt`;
    const folderPath = `Ring Data Ops/DataAutomation/${safeClient}`;
    const fullPath = `${folderPath}/${retryFilename}`;

    const retryContent = [
      `RETRY REQUESTED`,
      `Original Batch ID: ${log.batch_id || log_id}`,
      `Client: ${client.client_name} (${client_id})`,
      `Original records_sent: ${log.records_sent ?? 0}`,
      `Original delivery_method: ${log.delivery_method}`,
      `Original error: ${log.error_message || "unknown"}`,
      `Retry requested at: ${new Date().toISOString()}`,
      `Requested by: ${user.email}`,
      ``,
      `Please re-push the original data via the inboundPush endpoint or re-run the pipeline.`,
    ].join("\n");

    const uploadUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${fullPath}:/content`;
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "text/plain",
      },
      body: retryContent,
    });

    if (!uploadRes.ok) throw new Error(`SharePoint upload failed (${uploadRes.status}): ${await uploadRes.text()}`);

    const batchId = `retry_${Date.now()}`;

    // Log the retry attempt
    await base44.asServiceRole.entities.AlteryxDeliveryLog.create({
      client_id,
      data_type: log.data_type || "other",
      delivery_method: log.delivery_method || "API Push",
      batch_id: batchId,
      records_sent: 0,
      status: "Pending",
      error_message: `Retry marker created for original batch: ${log.batch_id || log_id}`,
      delivered_at: new Date().toISOString(),
    });

    // Update client delivery status
    await base44.asServiceRole.entities.Clients.update(client_id, {
      delivery_status: "Healthy",
    });

    return Response.json({
      success: true,
      message: "Retry marker placed in SharePoint. Please re-push the original data.",
      batch_id: batchId,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});