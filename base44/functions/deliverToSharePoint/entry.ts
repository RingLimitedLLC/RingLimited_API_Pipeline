import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Converts an array of objects to a CSV string.
 */
function toCSV(records) {
  if (!records || records.length === 0) return "";
  const keys = Object.keys(records[0]);
  const header = keys.map(k => `"${k}"`).join(",");
  const rows = records.map(r =>
    keys.map(k => {
      const val = r[k] == null ? "" : String(r[k]);
      return `"${val.replace(/"/g, '""')}"`;
    }).join(",")
  );
  return [header, ...rows].join("\r\n");
}


/**
 * Sanitizes a path segment by replacing invalid characters.
 */
function sanitizePathSegment(name) {
  return (name || "").replace(/[\\/:*?"<>|#%]/g, "_").trim();
}

const RING_DIGITAL_SITE_ID = "ringlimited.sharepoint.com,3a74755f-fec3-4822-b35b-7322a8c940ea,9fb7a2c4-2427-44d5-989e-f639534cafd3";

/**
 * Uploads a file to SharePoint at:
 *   Ring Digital > Ring Clients > Current Clients/{clientName}/{campaignName}/Data/Original/{filename}.csv
 */
async function uploadFileToSharePoint(accessToken, clientName, campaignName, filename, csvContent) {
  const safeClient = sanitizePathSegment(clientName);
  const safeCampaign = sanitizePathSegment(campaignName);
  const safeFilename = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  const fullPath = `Ring Clients/Current Clients/${safeClient}/${safeCampaign}/Data/Original/${safeFilename}`;
  const uploadUrl = `https://graph.microsoft.com/v1.0/sites/${RING_DIGITAL_SITE_ID}/drive/root:/${fullPath}:/content`;

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "text/csv",
    },
    body: csvContent,
  });

  if (!uploadRes.ok) throw new Error(`SharePoint upload failed (${uploadRes.status}): ${await uploadRes.text()}`);
  return await uploadRes.json();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { client_id, job_id, records, filename, client_name, campaign_name } = await req.json();
    if (!client_id || !records || !filename) {
      return Response.json({ error: "client_id, records, and filename are required" }, { status: 400 });
    }

    // Get SharePoint connection
    const { accessToken } = await base44.asServiceRole.connectors.getConnection("share_point");

    // Convert records to CSV
    const csvContent = toCSV(records);
    const recordCount = records.length;

    // Upload to SharePoint at: Ring Clients/Current Clients/{ClientName}/{CampaignName}/Data/Original/{filename}.csv
    const uploadResult = await uploadFileToSharePoint(accessToken, client_name || "Unknown Client", campaign_name || "Default", filename, csvContent);

    // Log the delivery
    const batchId = `batch_${Date.now()}`;
    await base44.asServiceRole.entities.AlteryxDeliveryLog.create({
      client_id,
      data_type: "other",
      delivery_method: "API Push",
      batch_id: batchId,
      records_sent: recordCount,
      status: "Success",
      delivered_at: new Date().toISOString(),
    });

    // Update client's last delivery timestamp
    await base44.asServiceRole.entities.Clients.update(client_id, {
      last_delivery_to_alteryx_at: new Date().toISOString(),
      delivery_status: "Healthy",
    });

    return Response.json({
      success: true,
      records_delivered: recordCount,
      filename: uploadResult.name,
      sharepoint_url: uploadResult.webUrl,
      batch_id: batchId,
    });

  } catch (error) {
    // Log the failed delivery if we have a client_id
    try {
      const base44 = createClientFromRequest(req);
      const body = await req.clone().json().catch(() => ({}));
      if (body.client_id) {
        await base44.asServiceRole.entities.AlteryxDeliveryLog.create({
          client_id: body.client_id,
          data_type: "other",
          delivery_method: "API Push",
          batch_id: `batch_${Date.now()}`,
          records_sent: 0,
          status: "Failed",
          error_message: error.message,
          delivered_at: new Date().toISOString(),
        });
        await base44.asServiceRole.entities.Clients.update(body.client_id, {
          delivery_status: "Failed",
        });
      }
    } catch (_) { /* best-effort logging */ }

    return Response.json({ error: error.message }, { status: 500 });
  }
});