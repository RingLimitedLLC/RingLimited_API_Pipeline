import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, ArrowRight, ArrowLeft, Loader2, AlertCircle } from "lucide-react";

export default function StepClientInfo({ form, update, onNext, onBack }) {
  const [selectedClient, setSelectedClient] = useState(form.client_name || "");

  const { data, isLoading, error } = useQuery({
    queryKey: ["clientsAndCampaigns"],
    queryFn: async () => {
      const result = await base44.functions.invoke("getClientsAndCampaigns");
      return result.data ?? result;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const clients = data?.clients ?? [];
  const allCampaigns = data?.campaigns ?? {};
  const campaignsForClient = selectedClient ? (allCampaigns[selectedClient] ?? []) : [];

  const handleClientChange = (name) => {
    setSelectedClient(name);
    update({ client_name: name, campaign_name: "" });
  };

  const handleCampaignChange = (name) => {
    const campaignObj = campaignsForClient.find((c) => c.name === name);
    update({ campaign_name: name, notion_url: campaignObj?.notion_url ?? "" });
  };

  const canProceed = form.client_name && form.campaign_name;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-[#afd741]">
          <Building2 className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Client & Campaign</h2>
          <p className="text-sm text-slate-500">Select the client and campaign for this connection</p>
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
        </>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="ghost" onClick={onBack} className="text-slate-500">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Button
          onClick={onNext}
          disabled={!canProceed}
          style={{ backgroundColor: "#afd741" }}
          className="text-white"
        >
          Next <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
