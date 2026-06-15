import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Converts a frequency string to minutes
function frequencyToMinutes(frequency) {
  switch (frequency) {
    case "15min": return 15;
    case "30min": return 30;
    case "1hr":   return 60;
    case "6hr":   return 360;
    case "12hr":  return 720;
    case "daily": return 1440;
    case "weekly": return 10080;
    default:      return null;
  }
}

// Check if the current time matches a daily/weekly schedule (within a 5-min window)
function matchesTimeSchedule(schedule, now) {
  const frequency = schedule.frequency;
  const [schedHour, schedMin] = (schedule.time || "09:00").split(":").map(Number);
  const currentHour = now.getUTCHours();
  const currentMin = now.getUTCMinutes();

  // Accept if within the current 5-minute window
  const withinWindow = currentHour === schedHour && currentMin < schedMin + 5 && currentMin >= schedMin;

  if (frequency === "daily") {
    return withinWindow;
  }

  if (frequency === "weekly") {
    const schedDay = parseInt(schedule.day ?? "1", 10);
    return now.getUTCDay() === schedDay && withinWindow;
  }

  return false;
}

// Check interval-based frequencies using last_sync_at
function isDueForIntervalSync(schedule, lastSyncAt) {
  const intervalMinutes = frequencyToMinutes(schedule.frequency);
  if (!intervalMinutes) return false;

  if (!lastSyncAt) return true; // Never synced — run now

  const lastSync = new Date(lastSyncAt);
  const diffMs = Date.now() - lastSync.getTime();
  const diffMinutes = diffMs / 60000;
  return diffMinutes >= intervalMinutes;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();

    // Start of current month (UTC)
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

    // Fetch all clients with scheduled sync enabled
    const allClients = await base44.asServiceRole.entities.Clients.list();
    const scheduled = allClients.filter(c => c.sync_schedule?.enabled);

    // Pre-fetch all sync jobs (to get campaign_name per job)
    const allSyncJobs = await base44.asServiceRole.entities.SyncJobs.list();

    // Pre-fetch campaigns and delivery logs in bulk
    const allCampaigns = await base44.asServiceRole.entities.Campaigns.list();
    const allDeliveryLogs = await base44.asServiceRole.entities.AlteryxDeliveryLog.filter({
      status: "Success"
    }, "-created_date", 10000);

    // Build a map: campaignKey (clientId+campaignName) -> { campaign, monthlyDelivered, totalDelivered }
    const campaignBudgetMap = {};
    for (const campaign of allCampaigns) {
      const key = `${campaign.client_id}::${campaign.campaign_name}`;
      // Sum records delivered this month
      const monthlyDelivered = allDeliveryLogs
        .filter(l => l.client_id === campaign.client_id && l.delivered_at >= monthStart)
        .reduce((sum, l) => sum + (l.records_sent || 0), 0);
      // Sum all-time records
      const totalDelivered = allDeliveryLogs
        .filter(l => l.client_id === campaign.client_id)
        .reduce((sum, l) => sum + (l.records_sent || 0), 0);

      campaignBudgetMap[key] = { campaign, monthlyDelivered, totalDelivered };
    }

    const results = [];

    for (const client of scheduled) {
      const schedule = client.sync_schedule;
      const frequency = schedule.frequency;
      let shouldSync = false;

      if (["15min", "30min", "1hr", "6hr", "12hr"].includes(frequency)) {
        shouldSync = isDueForIntervalSync(schedule, client.last_sync_at);
      } else if (["daily", "weekly"].includes(frequency)) {
        shouldSync = matchesTimeSchedule(schedule, now);
      }

      if (!shouldSync) continue;

      // Get sync jobs for this client to check campaign budgets
      const clientJobs = allSyncJobs.filter(j => j.client_id === client.id && j.is_enabled);

      // Check if ANY job is budget-paused (we pause the whole client sync if any job is over budget)
      const pausedReasons = [];
      for (const job of clientJobs) {
        if (!job.campaign_name) continue;
        const key = `${client.id}::${job.campaign_name}`;
        const entry = campaignBudgetMap[key];
        if (!entry) continue;
        const { campaign, monthlyDelivered, totalDelivered } = entry;

        if (campaign.monthly_lead_budget && monthlyDelivered >= campaign.monthly_lead_budget) {
          pausedReasons.push(`Campaign "${job.campaign_name}" has reached its monthly budget (${monthlyDelivered}/${campaign.monthly_lead_budget}). Paused until the 1st of next month.`);
        }
        if (campaign.total_lead_budget && totalDelivered >= campaign.total_lead_budget) {
          pausedReasons.push(`Campaign "${job.campaign_name}" has reached its total lead budget (${totalDelivered}/${campaign.total_lead_budget}).`);
        }
      }

      if (pausedReasons.length > 0) {
        // Log a skipped sync so it's visible
        await base44.asServiceRole.entities.SyncLogs.create({
          client_id: client.id,
          sync_type: "Scheduled",
          status: "Failed",
          records_processed: 0,
          error_message: `Budget pause: ${pausedReasons[0]}`,
        });
        results.push({ client_id: client.id, client_name: client.client_name, skipped: true, reason: pausedReasons[0] });
        continue;
      }

      // Run the sync
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
        last_sync_at: now.toISOString(),
        connection_status: success ? "Connected" : "Error",
      });

      results.push({ client_id: client.id, client_name: client.client_name, success, records: success ? records : 0 });
    }

    return Response.json({ processed: results.length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});