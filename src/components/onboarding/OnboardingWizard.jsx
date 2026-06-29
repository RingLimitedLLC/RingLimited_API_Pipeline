import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from "@/api/base44Client";
import { Building2, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_FORM = {
  client_name: "",
  campaign_name: "",
  notion_url: "",
};

export default function OnboardingWizard({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [selectedClient, setSelectedClient] = useState("");
  const [saving, setSaving] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["clientsAndCampaigns"],
    queryFn: async () => {
      const result = await base44.functions.invoke("getClientsAndCampaigns");
      return result.data ?? result;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
    enabled: open,
  });

  const clients = data?.clients ?? [];
  const allCampaigns = data?.campaigns ?? {};
  const campaignsForClient = selectedClient ? (allCampaigns[selectedClient] ?? []) : [];

  const handleClientChange = (name) => {
    setSelectedClient(name);
    setForm((prev) => ({ ...prev, client_name: name, campaign_name: "" }));
  };

  const handleCampaignChange = (name) => {
    const campaignObj = campaignsForClient.find((c) => c.name === name);
    setForm((prev) => ({ ...prev, campaign_name: name, notion_url: campaignObj?.notion_url ?? "" }));
  };

  const handleClose = () => {
    setSelectedClient("");
    setForm(DEFAULT_FORM);
    onOpenChange(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const existingClients = await base44.entities.Clients.filter({ client_name: form.client_name });
      let client = existingClients[0];
      if (!client) {
        client = await base44.entities.Clients.create({ client_name: form.client_name });
      }

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

      toast.success(`${form.client_name} / ${form.campaign_name} created — add connections from the client page.`);
      handleClose();
      onCreated();
    } catch (err) {
      toast.error(`Failed to create records: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const canProceed = form.client_name && form.campaign_name && !saving;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-[#afd741]">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">New Client & Campaign</h2>
              <p className="text-sm text-slate-500">Select the client and campaign to get started</p>
            </div>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-10 gap-2 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading clients…</span>
            </div>
          )}

          {error && !isLoading && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Could not load clients</p>
                <p className="text-red-600 mt-0.5">{error.message}</p>
              </div>
            </div>
          )}

          {!isLoading && !error && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">Client *</Label>
                <Select value={selectedClient} onValueChange={handleClientChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a client…" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((name) => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">Campaign *</Label>
                <Select
                  value={form.campaign_name}
                  onValueChange={handleCampaignChange}
                  disabled={!selectedClient}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={selectedClient ? "Select a campaign…" : "Select a client first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {campaignsForClient.map((c) => (
                      <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
                <p className="text-xs text-slate-500">
                  Connections, credentials, schedules, and SharePoint output folders are configured per-pipeline from the client detail page.
                </p>
              </div>
            </>
          )}

          <div className="flex justify-between pt-1">
            <Button variant="ghost" onClick={handleClose} className="text-slate-500" disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!canProceed}
              style={{ backgroundColor: "#afd741" }}
              className="text-white px-6"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              {saving ? "Creating…" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
