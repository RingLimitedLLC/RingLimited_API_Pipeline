import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

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

export default function StepReview({ form, onBack, onFinished }) {
  const [saving, setSaving] = useState(false);
  const ct = form.connection_type;
  const credFields = ct?.fields ?? [];
  const settingFields = ct?.settings ?? [];
  const allFields = [...credFields, ...settingFields];

  const handleSave = async () => {
    setSaving(true);
    try {
      const newClient = await base44.entities.Clients.create({
        client_name: form.client_name,
        connection_type: ct?.id,
        crm_type: ct?.label,
        auth_type: ct?.defaultAuthType,
        connection_status: "Not Connected",
        frequency_type: form.frequency_type,
        interval_value: form.interval_value,
        interval_unit: form.interval_unit,
        scheduled_time: form.scheduled_time,
        scheduled_day: form.scheduled_day,
      });

      const hasFields = allFields.some(
        (f) => (form.connection_type_fields?.[f.key] || "").trim()
      );
      if (hasFields) {
        await base44.functions.invoke("saveConnectionCredentials", {
          client_id: newClient.id,
          connection_type: ct?.id,
          fields: form.connection_type_fields,
        });
      }

      toast.success(`${form.client_name} added successfully!`);
      onFinished();
    } catch (error) {
      toast.error(`Setup failed: ${error.message}`);
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
          <p className="text-sm text-slate-500">Everything look right? Let's create the client.</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 divide-y divide-slate-100 overflow-hidden">
        <div className="px-4 py-2 bg-slate-100">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Client Info</p>
        </div>
        <div className="px-4">
          <Row label="Client Name" value={form.client_name} />
          <Row label="Platform" value={ct?.label} />
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

        <div className="px-4 py-2 bg-slate-100">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Sync Schedule</p>
        </div>
        <div className="px-4">
          <Row label="Frequency" value={freqLabel(form)} />
        </div>
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
          {saving ? "Creating…" : "Create Client"}
        </Button>
      </div>
    </div>
  );
}
