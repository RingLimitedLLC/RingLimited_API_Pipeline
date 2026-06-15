import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FolderOpen, ArrowRight, ArrowLeft, Info } from "lucide-react";

export default function StepSharePoint({ form, update, onNext, onBack }) {
  const campaignName = form.campaign_name || form.initial_campaign || "";
  const filename = form.sharepoint_filename || form.client_name.replace(/\s+/g, "_") || "";

  const previewPath = `Ring Data Ops/DataAutomation/${form.client_name || "<ClientName>"}/${campaignName || "<CampaignName>"}/${filename || "<filename>"}.csv`;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#afd741" }}>
          <FolderOpen className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">SharePoint Folder Mapping</h2>
          <p className="text-sm text-slate-500">Define where delivered files will land in SharePoint</p>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex gap-2 text-xs text-slate-600">
        <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
        Files are delivered under <code className="bg-slate-200 px-1 rounded">Ring Data Ops/DataAutomation</code> automatically.
        You just need to set the campaign folder and filename.
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-slate-600">Campaign Folder Name *</Label>
        <Input
          value={form.campaign_name}
          onChange={(e) => update({ campaign_name: e.target.value })}
          placeholder={form.initial_campaign || "e.g. Summer2024_Retargeting"}
        />
        <p className="text-xs text-slate-400">This becomes the folder name under your client in SharePoint.</p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-slate-600">Output Filename (without .csv) *</Label>
        <Input
          value={form.sharepoint_filename}
          onChange={(e) => update({ sharepoint_filename: e.target.value })}
          placeholder={`${form.client_name.replace(/\s+/g, "_") || "ClientName"}_leads`}
        />
        <p className="text-xs text-slate-400">The CSV file will be named this when delivered.</p>
      </div>

      {/* Live path preview */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Delivery Path Preview</p>
        <div className="flex items-start gap-2">
          <FolderOpen className="h-4 w-4 text-[#afd741] mt-0.5 shrink-0" />
          <code className="text-xs text-slate-700 break-all leading-relaxed">{previewPath}</code>
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="ghost" onClick={onBack} className="text-slate-500">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Button
          onClick={onNext}
          disabled={!form.campaign_name.trim() || !form.sharepoint_filename.trim()}
          style={{ backgroundColor: "#afd741" }}
          className="text-white"
        >
          Review <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}