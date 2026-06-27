import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, ArrowLeft, Loader2, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import SharePointFolderPicker from "@/components/client/SharePointFolderPicker";

const Row = ({ label, value }) => (
  <div className="flex justify-between py-2 border-b border-slate-100 last:border-0">
    <span className="text-xs text-slate-500">{label}</span>
    <span className="text-xs font-medium text-slate-800 text-right max-w-[55%] break-all">{value || "—"}</span>
  </div>
);

const freqLabel = (form) => {
  if (form.frequency_type === "interval") return `Every ${form.interval_value} ${form.interval_unit}`;
  if (form.frequency_type === "daily") return `Daily at ${form.scheduled_time}`;
  if (form.frequency_type === "weekly") {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `Weekly on ${days[Number(form.scheduled_day) || 1]} at ${form.scheduled_time}`;
  }
  return "Manual only";
};

export default function StepReview({ form, update, onBack, onFinished }) {
  const [saving, setSaving] = useState(false);
  const ct = form.connection_type;
  const credFields = ct?.fields ?? [];
  const settingFields = ct?.settings ?? [];
  const allFields = [...credFields, ...settingFields];
  const isInbound = ct?.direction === "inbound";

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. Find or create Client
      const existingClients = await base44.entities.Clients.filter({ client_name: form.client_name });
      let client = existingClients[0];
      if (!client) {
        client = await base44.entities.Clients.create({ client_name: form.client_name });
      }

      // 2. Find or create Campaign
      const existingCampaigns = await base44.entities.Campaigns.filter({
        client_id: client.id,
        campaign_name: form.campaign_name,
      });
      let campaign = existingCampaigns[0];
      if (!campaign) {
        campaign = await base44.entities.Campaigns.create({
          client_id: client.id,
          client_name: form.client_name,
          campaign_name: form.campaign_name,
          notion_url: form.notion_url || "",
        });
      }

      // 3. Create Connection
      const connection = await base44.entities.Connections.create({
        client_id: client.id,
        client_name: form.client_name,
        campaign_id: campaign.id,
        campaign_name: form.campaign_name,
        connection_type: ct?.id,
        platform_label: ct?.label,
        direction: ct?.direction || "outbound",
        connection_status: "Not Connected",
        frequency_type: isInbound ? "manual" : form.frequency_type,
        interval_value: form.interval_value,
        interval_unit: form.interval_unit,
        scheduled_time: form.scheduled_time,
        scheduled_day: form.scheduled_day,
        sharepoint_folder_id: form.sharepoint_folder?.id || "",
        sharepoint_folder_path: form.sharepoint_folder?.path || "",
      });

      // 4. Save credentials if any fields were entered
      const hasFields = allFields.some((f) => (form.connection_type_fields?.[f.key] || "").trim());
      if (hasFields) {
        try {
          await base44.functions.invoke("saveConnectionCredentials", {
            connection_id: connection.id,
            connection_type: ct?.id,
            fields: form.connection_type_fields,
          });
        } catch (credError) {
          toast.warning(
            `Connection created, but credentials could not be saved: ${credError.message}. ` +
            `You can re-enter them from the connection detail page.`
          );
          onFinished();
          return;
        }
      }

      toast.success(`${form.client_name} / ${form.campaign_name} connection added!`);
      onFinished();
    } catch (error) {
      toast.error(`Failed to create connection: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-[#afd741]">
          <CheckCircle2 className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Review & Confirm</h2>
          <p className="text-sm text-slate-500">Everything look right? Let's create the connection.</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 divide-y divide-slate-100 overflow-hidden">
        <div className="px-4 py-2 bg-slate-100">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Connection</p>
        </div>
        <div className="px-4">
          <Row label="Client" value={form.client_name} />
          <Row label="Campaign" value={form.campaign_name} />
          <Row label="Platform" value={ct?.label} />
          <Row label="Direction" value={isInbound ? "Inbound (client pushes data)" : "Outbound (we pull data)"} />
        </div>

        {allFields.length > 0 && (
          <>
            <div className="px-4 py-2 bg-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Credentials & Settings</p>
            </div>
            <div className="px-4">
              {allFields.map((field) => {
                const val = form.connection_type_fields?.[field.key];
                return (
                  <Row
                    key={field.key}
                    label={field.label}
                    value={field.secret ? (val ? "••••••••••••••••" : "—") : (val || field.defaultValue || "—")}
                  />
                );
              })}
            </div>
          </>
        )}

        {!isInbound && (
          <>
            <div className="px-4 py-2 bg-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Sync Schedule</p>
            </div>
            <div className="px-4">
              <Row label="Frequency" value={freqLabel(form)} />
            </div>
          </>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-slate-400" />
          <span className="text-xs font-medium text-slate-600">SharePoint Delivery Folder <span className="text-slate-400 font-normal">(optional)</span></span>
        </div>
        <SharePointFolderPicker
          value={form.sharepoint_folder}
          onChange={(folder) => update({ sharepoint_folder: folder })}
        />
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="ghost" onClick={onBack} className="text-slate-500" disabled={saving}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving}
          style={{ backgroundColor: "#afd741" }}
          className="text-white px-6"
        >
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
          {saving ? "Creating…" : "Create Connection"}
        </Button>
      </div>
    </div>
  );
}
