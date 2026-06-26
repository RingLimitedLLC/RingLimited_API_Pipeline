import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_CRM_TYPES = ["HubSpot", "Salesforce", "GoHighLevel", "WooCommerce", "Other"];

export default function AddClientDialog({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState({
    client_name: "",
    crm_type: "HubSpot",
    auth_type: "API Key",
    api_base_url: "",
    initial_campaign: "",
  });
  const [creating, setCreating] = useState(false);
  const [customCrm, setCustomCrm] = useState("");
  const [extraCrmTypes, setExtraCrmTypes] = useState(() => {
    try { return JSON.parse(localStorage.getItem("extraCrmTypes") || "[]"); } catch { return []; }
  });

  const handleCrmChange = (v) => {
    setForm({ ...form, crm_type: v });
    if (v !== "Other") setCustomCrm("");
  };

  const handleAddCustomCrm = () => {
    const trimmed = customCrm.trim();
    if (!trimmed) return;
    const updated = [...extraCrmTypes, trimmed];
    setExtraCrmTypes(updated);
    localStorage.setItem("extraCrmTypes", JSON.stringify(updated));
    setForm({ ...form, crm_type: trimmed });
    setCustomCrm("");
  };

  const handleCreate = async () => {
    if (!form.client_name.trim()) {
      toast.error("Client name is required");
      return;
    }
    if (form.crm_type === "Other" && customCrm.trim()) {
      handleAddCustomCrm();
      return;
    }
    setCreating(true);
    const { initial_campaign, ...clientData } = form;
    const newClient = await base44.entities.Clients.create({
      ...clientData,
      connection_status: "Not Connected",
    });
    if (initial_campaign.trim()) {
      await base44.entities.Campaigns.create({
        client_id: newClient.id,
        campaign_name: initial_campaign.trim(),
        status: "Active",
      });
    }
    toast.success("Client created");
    setForm({ client_name: "", crm_type: "HubSpot", auth_type: "API Key", api_base_url: "", initial_campaign: "" });
    setCustomCrm("");
    onCreated();
    onOpenChange(false);
    setCreating(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Client</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-500">Client Name</Label>
            <Input value={form.client_name} onChange={e => setForm({...form, client_name: e.target.value})} placeholder="Acme Corp" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-500">Connection Type</Label>
            <Select value={form.crm_type} onValueChange={handleCrmChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEFAULT_CRM_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                {extraCrmTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            {form.crm_type === "Other" && (
              <div className="flex gap-2 mt-2">
                <Input
                  placeholder="Enter CRM name…"
                  value={customCrm}
                  onChange={e => setCustomCrm(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAddCustomCrm()}
                />
                <Button type="button" variant="outline" onClick={handleAddCustomCrm} disabled={!customCrm.trim()}>
                  Add
                </Button>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-500">Auth Type</Label>
            <Select value={form.auth_type} onValueChange={v => setForm({...form, auth_type: v})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="API Key">API Key</SelectItem>
                <SelectItem value="OAuth2">OAuth2</SelectItem>
                <SelectItem value="Webhook Only">Webhook Only</SelectItem>
                <SelectItem value="Client Post">Client Post</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-500">API Base URL</Label>
            <Input value={form.api_base_url} onChange={e => setForm({...form, api_base_url: e.target.value})} placeholder="https://api.example.com" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-500">Campaign Name <span className="text-slate-400 font-normal">(optional)</span></Label>
            <Input value={form.initial_campaign} onChange={e => setForm({...form, initial_campaign: e.target.value})} placeholder="e.g. Summer2024_Retargeting" />
            <p className="text-xs text-slate-400">You can add more campaigns later from the client detail page.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={creating} className="bg-indigo-600 hover:bg-indigo-700">
            {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
