import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Inbound Push Endpoint
 *
 * Supports two modes:
 *
 * 1. TARGET push (product-level):
 *    - Requires: product_id, campaign_name, filename, records
 *    - Auth: Bearer <product.inbound_api_key>
 *    - Enforces monthly + total lead budgets and campaign date window
 *
 * 2. SUPPRESSION or CONVERSION push (client-level / campaign-level):
 *    - Requires: client_id, list_type ("suppression" | "conversion"), campaign_name, filename, records
 *    - Auth: Bearer <client.inbound_suppression_api_key> or <campaign.inbound_conversion_api_key>
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

function sanitizePathSegment(name) {
  return (name || "").replace(/[\\/:*?"<>|#%]/g, "_").trim();
}

const RING_DIGITAL_SITE_ID = "ringlimited.sharepoint.com,3a74755f-fec3-4822-b35b-7322a8c940ea,9fb7a2c4-2427-44d5-989e-f639534cafd3";

async function uploadToSharePoint(accessToken, clientName, campaignName, filename, csvContent) {
  const safeClient = sanitizePathSegment(clientName);
  const safeCampaign = sanitizePathSegment(campaignName);
  const safeFilename = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  const fullPath = `Ring Clients/Current Clients/${safeClient}/${safeCampaign}/Data/Original/${safeFilename}`;
  const uploadUrl = `https://graph.microsoft.com/v1.0/sites/${RING_DIGITAL_SITE_ID}/drive/root:/${fullPath}:/content`;

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "text/csv" },
    body: csvContent,
  });

  if (!uploadRes.ok) throw new Error(`SharePoint upload failed (${uploadRes.status}): ${await uploadRes.text()}`);
  return await uploadRes.json();
}

function todayYMD() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let body = {};
  try { body = await req.json(); } catch (_) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return Response.json({ error: "Missing Authorization header (Bearer token required)" }, { status: 401 });
  }

  const { product_id, client_id, list_type, campaign_name, filename, records } = body;

  if (!Array.isArray(records) || records.length === 0) {
    return Response.json({ error: "records must be a non-empty array" }, { status: 400 });
  }
  if (!campaign_name || !filename) {
    return Response.json({ error: "campaign_name and filename are required" }, { status: 400 });
  }

  try {
    const base44 = createClientFromRequest(req);

    // ── TARGET push via product_id ─────────────────────────────────────────
    if (product_id) {
      const products = await base44.asServiceRole.entities.CampaignProducts.filter({ id: product_id });
      const product = products[0];
      if (!product) return Response.json({ error: "Product not found" }, { status: 404 });
      if (!product.inbound_api_key || product.inbound_api_key !== token) {
        return Response.json({ error: "Invalid API key for this product" }, { status: 403 });
      }

      // Fetch parent campaign for date window
      const campaigns = await base44.asServiceRole.entities.Campaigns.filter({ id: product.campaign_id });
      const campaign = campaigns[0];
      if (!campaign) return Response.json({ error: "Campaign not found" }, { status: 404 });

      const today = todayYMD();

      // Date window check
      if (campaign.start_date && today < campaign.start_date) {
        return Response.json({ error: `Campaign has not started yet (starts ${campaign.start_date})` }, { status: 422 });
      }
      if (campaign.end_date && today > campaign.end_date) {
        return Response.json({ error: `Campaign has ended (ended ${campaign.end_date})` }, { status: 422 });
      }

      // Status check
      if (product.status === "Budget Met") {
        return Response.json({ error: "Total lead budget has been met for this product" }, { status: 422 });
      }
      if (product.status === "Expired" || product.status === "Paused") {
        return Response.json({ error: `Product is currently ${product.status}` }, { status: 422 });
      }

      // Monthly budget — reset counter if we're in a new month
      const thisMonth = currentMonthStart();
      let monthlyCount = product.leads_received_this_month || 0;
      if ((product.leads_month_reset_at || "") < thisMonth) {
        monthlyCount = 0; // will be set fresh below
      }

      if (product.monthly_lead_budget && monthlyCount >= product.monthly_lead_budget) {
        return Response.json({ error: `Monthly lead budget of ${product.monthly_lead_budget} has been met for this product` }, { status: 422 });
      }

      // Total budget check
      const totalCount = product.leads_received_total || 0;
      if (product.total_lead_budget && totalCount >= product.total_lead_budget) {
        return Response.json({ error: `Total lead budget of ${product.total_lead_budget} has been met for this product` }, { status: 422 });
      }

      // Clamp to remaining budget if batch would overflow
      let recordsToAccept = records;
      if (product.monthly_lead_budget) {
        const monthlyRemaining = product.monthly_lead_budget - monthlyCount;
        if (records.length > monthlyRemaining) recordsToAccept = records.slice(0, monthlyRemaining);
      }
      if (product.total_lead_budget) {
        const totalRemaining = product.total_lead_budget - totalCount;
        if (recordsToAccept.length > totalRemaining) recordsToAccept = recordsToAccept.slice(0, totalRemaining);
      }

      // Get client for client_name
      const clients = await base44.asServiceRole.entities.Clients.filter({ id: product.client_id });
      const client = clients[0];
      if (!client) return Response.json({ error: "Client not found" }, { status: 404 });

      const { accessToken } = await base44.asServiceRole.connectors.getConnection("share_point");
      const csvContent = toCSV(recordsToAccept);
      const uploadResult = await uploadToSharePoint(accessToken, client.client_name, campaign_name, filename, csvContent);

      // Update product counters
      const newMonthlyCount = monthlyCount + recordsToAccept.length;
      const newTotalCount = totalCount + recordsToAccept.length;
      const budgetMet = (product.total_lead_budget && newTotalCount >= product.total_lead_budget);
      await base44.asServiceRole.entities.CampaignProducts.update(product_id, {
        leads_received_total: newTotalCount,
        leads_received_this_month: newMonthlyCount,
        leads_month_reset_at: thisMonth,
        ...(budgetMet ? { status: "Budget Met" } : {}),
      });

      const batchId = `inbound_${Date.now()}`;
      await base44.asServiceRole.entities.AlteryxDeliveryLog.create({
        client_id: product.client_id,
        data_type: "other",
        delivery_method: "API Push",
        batch_id: batchId,
        records_sent: recordsToAccept.length,
        status: "Success",
        error_message: `product: ${product.product_name}`,
        delivered_at: new Date().toISOString(),
      });
      await base44.asServiceRole.entities.Clients.update(product.client_id, {
        last_delivery_to_alteryx_at: new Date().toISOString(),
        delivery_status: "Healthy",
      });

      return Response.json({
        success: true,
        records_accepted: recordsToAccept.length,
        records_submitted: records.length,
        filename: uploadResult.name,
        sharepoint_url: uploadResult.webUrl,
        batch_id: batchId,
        budget_status: {
          total_received: newTotalCount,
          total_budget: product.total_lead_budget || null,
          monthly_received: newMonthlyCount,
          monthly_budget: product.monthly_lead_budget || null,
        },
      });
    }

    // ── SUPPRESSION or CONVERSION push (client_id based) ──────────────────
    if (!client_id) {
      return Response.json({ error: "Either product_id (target) or client_id + list_type (suppression/conversion) is required" }, { status: 400 });
    }

    const resolvedListType = list_type || "suppression";
    if (!["suppression", "conversion"].includes(resolvedListType)) {
      return Response.json({ error: "list_type must be 'suppression' or 'conversion' for client-level pushes" }, { status: 400 });
    }

    if (resolvedListType === "suppression") {
      const clients = await base44.asServiceRole.entities.Clients.filter({ id: client_id });
      const client = clients[0];
      if (!client) return Response.json({ error: "Client not found" }, { status: 404 });
      if (!client.inbound_suppression_api_key || client.inbound_suppression_api_key !== token) {
        return Response.json({ error: "Invalid API key for suppression list" }, { status: 403 });
      }

      const { accessToken } = await base44.asServiceRole.connectors.getConnection("share_point");
      const uploadResult = await uploadToSharePoint(accessToken, client.client_name, campaign_name, filename, toCSV(records));
      const batchId = `inbound_${Date.now()}`;

      await base44.asServiceRole.entities.AlteryxDeliveryLog.create({
        client_id,
        data_type: "other",
        delivery_method: "API Push",
        batch_id: batchId,
        records_sent: records.length,
        status: "Success",
        error_message: "list_type: suppression",
        delivered_at: new Date().toISOString(),
      });
      await base44.asServiceRole.entities.Clients.update(client_id, {
        last_delivery_to_alteryx_at: new Date().toISOString(),
        delivery_status: "Healthy",
      });

      return Response.json({ success: true, records_delivered: records.length, filename: uploadResult.name, sharepoint_url: uploadResult.webUrl, batch_id: batchId });
    }

    // conversion — key lives on the Campaign
    const campaignResults = await base44.asServiceRole.entities.Campaigns.filter({ client_id });
    const campaign = campaignResults.find(c => c.campaign_name === campaign_name);
    if (!campaign) return Response.json({ error: `Campaign "${campaign_name}" not found for this client` }, { status: 404 });
    if (!campaign.inbound_conversion_api_key || campaign.inbound_conversion_api_key !== token) {
      return Response.json({ error: "Invalid API key for conversion list" }, { status: 403 });
    }

    const clientsForConv = await base44.asServiceRole.entities.Clients.filter({ id: client_id });
    const clientForConv = clientsForConv[0];
    if (!clientForConv) return Response.json({ error: "Client not found" }, { status: 404 });

    const { accessToken: convToken } = await base44.asServiceRole.connectors.getConnection("share_point");
    const convUpload = await uploadToSharePoint(convToken, clientForConv.client_name, campaign_name, filename, toCSV(records));
    const batchId = `inbound_${Date.now()}`;

    await base44.asServiceRole.entities.AlteryxDeliveryLog.create({
      client_id,
      data_type: "other",
      delivery_method: "API Push",
      batch_id: batchId,
      records_sent: records.length,
      status: "Success",
      error_message: "list_type: conversion",
      delivered_at: new Date().toISOString(),
    });
    await base44.asServiceRole.entities.Clients.update(client_id, {
      last_delivery_to_alteryx_at: new Date().toISOString(),
      delivery_status: "Healthy",
    });

    return Response.json({ success: true, records_delivered: records.length, filename: convUpload.name, sharepoint_url: convUpload.webUrl, batch_id: batchId });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});