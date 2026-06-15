import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, ArrowRight, X } from "lucide-react";

const CRM_TYPES = ["HubSpot", "Salesforce", "GoHighLevel", "WooCommerce", "Other"];

export default function StepClientInfo({ form, update, onNext, onSkip, onCancel }) {
  const [customCrm, setCustomCrm] = useState("");

  const canProceed = form.client_name.trim();

  const handleAddCustomCrm = () => {
    const trimmed = customCrm.trim();
    if (!trimmed) return;
    update({ crm_type: trimmed });
    setCustomCrm("");
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#afd741" }}>
          <Building2 className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Client Information</h2>
          <p className="text-sm text-slate-500">Start by telling us about your client</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-slate-600">Client Name *</Label>
        <Input
          value={form.client_name}
          onChange={(e) => update({ client_name: e.target.value })}
          placeholder="e.g. Acme Corporation"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-slate-600">CRM Type <span className="text-slate-400 font-normal">(optional)</span></Label>
        <Select value={form.crm_type} onValueChange={(v) => update({ crm_type: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CRM_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        {form.crm_type === "Other" && (
          <div className="flex gap-2 mt-2">
            <Input
              placeholder="Enter CRM name…"
              value={customCrm}
              onChange={(e) => setCustomCrm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddCustomCrm()}
            />
            <Button type="button" variant="outline" onClick={handleAddCustomCrm} disabled={!customCrm.trim()}>
              Set
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-slate-600">API Base URL</Label>
        <Input
          value={form.api_base_url}
          onChange={(e) => update({ api_base_url: e.target.value })}
          placeholder="https://api.hubapi.com"
        />
        <p className="text-xs text-slate-400">The root URL of the CRM's API. You can update this later.</p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-slate-600">Initial Campaign <span className="text-slate-400 font-normal">(optional)</span></Label>
        <Input
          value={form.initial_campaign}
          onChange={(e) => update({ initial_campaign: e.target.value })}
          placeholder="e.g. Summer2024_Retargeting"
        />
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="ghost" onClick={onCancel} className="text-slate-500">
          <X className="h-4 w-4 mr-1" /> Cancel
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onSkip} disabled={!canProceed} className="text-slate-600">
            Create Now
          </Button>
          <Button onClick={onNext} disabled={!canProceed} style={{ backgroundColor: "#afd741" }} className="text-white">
            Next <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}