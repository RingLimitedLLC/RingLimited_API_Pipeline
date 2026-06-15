import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sinceISO = since.toISOString();

    // Fetch all data in parallel
    const [syncLogs, deliveryLogs, clients, allUsers] = await Promise.all([
      base44.asServiceRole.entities.SyncLogs.filter({ status: "Failed" }, "-created_date", 200),
      base44.asServiceRole.entities.AlteryxDeliveryLog.filter({ status: "Failed" }, "-created_date", 200),
      base44.asServiceRole.entities.Clients.list(),
      base44.asServiceRole.entities.User.list(),
    ]);

    // Filter to last 24 hours
    const recentSyncFails = syncLogs.filter(l => l.created_date >= sinceISO);
    const recentDeliveryFails = deliveryLogs.filter(l => l.created_date >= sinceISO);

    // Get admin emails
    const adminEmails = allUsers
      .filter(u => u.role === "admin" && u.email)
      .map(u => u.email);

    if (adminEmails.length === 0) {
      return Response.json({ message: "No admin users found, skipping digest." });
    }

    // If nothing failed, send a clean bill of health
    const totalFailures = recentSyncFails.length + recentDeliveryFails.length;

    // Build client lookup
    const clientMap = Object.fromEntries(clients.map(c => [c.id, c.client_name]));

    const formatDate = (iso) => {
      if (!iso) return "—";
      return new Date(iso).toLocaleString("en-US", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/New_York"
      });
    };

    // Build email body
    let syncSection = "";
    if (recentSyncFails.length === 0) {
      syncSection = `<p style="color:#16a34a;">✅ No sync failures in the last 24 hours.</p>`;
    } else {
      const rows = recentSyncFails.map(l => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${clientMap[l.client_id] || l.client_id || "—"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${l.sync_type || "—"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${formatDate(l.created_date)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#dc2626;font-size:12px;">${l.error_message || "—"}</td>
        </tr>`).join("");
      syncSection = `
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:600;font-size:11px;text-transform:uppercase;">Client</th>
              <th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:600;font-size:11px;text-transform:uppercase;">Type</th>
              <th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:600;font-size:11px;text-transform:uppercase;">Time</th>
              <th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:600;font-size:11px;text-transform:uppercase;">Error</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
    }

    let deliverySection = "";
    if (recentDeliveryFails.length === 0) {
      deliverySection = `<p style="color:#16a34a;">✅ No delivery failures in the last 24 hours.</p>`;
    } else {
      const rows = recentDeliveryFails.map(l => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${clientMap[l.client_id] || l.client_id || "—"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${l.delivery_method || "—"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${l.records_sent ?? "—"}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${formatDate(l.delivered_at || l.created_date)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#dc2626;font-size:12px;">${l.error_message || "—"}</td>
        </tr>`).join("");
      deliverySection = `
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:600;font-size:11px;text-transform:uppercase;">Client</th>
              <th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:600;font-size:11px;text-transform:uppercase;">Method</th>
              <th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:600;font-size:11px;text-transform:uppercase;">Records</th>
              <th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:600;font-size:11px;text-transform:uppercase;">Time</th>
              <th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:600;font-size:11px;text-transform:uppercase;">Error</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
    }

    const statusBanner = totalFailures === 0
      ? `<div style="background:#dcfce7;border:1px solid #86efac;border-radius:8px;padding:16px;margin-bottom:24px;color:#15803d;font-weight:600;">🟢 All systems healthy — no failures in the last 24 hours.</div>`
      : `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:16px;margin-bottom:24px;color:#dc2626;font-weight:600;">🔴 ${totalFailures} failure${totalFailures > 1 ? "s" : ""} detected in the last 24 hours — review below.</div>`;

    const emailBody = `
      <div style="font-family:Inter,ui-sans-serif,system-ui,sans-serif;max-width:700px;margin:0 auto;color:#1e293b;">
        <div style="background:#194155;padding:24px 32px;border-radius:12px 12px 0 0;">
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">Pipeline Daily Digest</h1>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:13px;">${formatDate(now.toISOString())} ET</p>
        </div>
        <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
          ${statusBanner}

          <h2 style="font-size:15px;font-weight:700;color:#0f172a;margin:0 0 12px;">Sync Failures (${recentSyncFails.length})</h2>
          ${syncSection}

          <h2 style="font-size:15px;font-weight:700;color:#0f172a;margin:24px 0 12px;">Delivery Failures (${recentDeliveryFails.length})</h2>
          ${deliverySection}

          <p style="margin-top:32px;font-size:12px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:16px;">
            This digest is sent daily to all Pipeline admin users. Log in to the Pipeline dashboard to acknowledge or resolve issues.
          </p>
        </div>
      </div>`;

    // Send to all admins
    const subject = totalFailures === 0
      ? "✅ Pipeline Daily Digest — All Systems Healthy"
      : `🔴 Pipeline Daily Digest — ${totalFailures} Failure${totalFailures > 1 ? "s" : ""} Detected`;

    await Promise.all(adminEmails.map(email =>
      base44.asServiceRole.integrations.Core.SendEmail({
        to: email,
        subject,
        body: emailBody,
        from_name: "Pipeline Alerts",
      })
    ));

    return Response.json({
      success: true,
      admins_notified: adminEmails.length,
      sync_failures: recentSyncFails.length,
      delivery_failures: recentDeliveryFails.length,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});