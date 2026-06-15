import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import CredentialsForm from "@/components/client/CredentialsForm";
import ConnectionActions from "@/components/client/ConnectionActions";
import SyncLogsTable from "@/components/client/SyncLogsTable";
import EventsTable from "@/components/client/EventsTable";
import SharePointDeliveryTable from "@/components/client/SharePointDeliveryTable";
import SharePointStatusCard from "@/components/client/SharePointStatusCard";
import TeamAssignment from "@/components/client/TeamAssignment";
import SyncJobsManager from "@/components/client/SyncJobsManager";
import CampaignsManager from "@/components/client/CampaignsManager";
import InboundReceiptsLog from "@/components/client/InboundReceiptsLog";
import InboundPushManager from "@/components/client/InboundPushManager";

// Strip all secret/credential fields before passing client data to frontend components.
// These values should never be readable in the UI (write-only pattern).
const SECRET_FIELDS = [
  "api_key", "access_token", "refresh_token", "webhook_secret",
  "woo_consumer_key", "woo_consumer_secret", "inbound_api_key",
];
function sanitizeClient(client) {
  if (!client) return client;
  const safe = { ...client };
  SECRET_FIELDS.forEach(f => { if (f in safe) safe[f] = safe[f] ? "••SET••" : ""; });
  return safe;
}

export default function ClientDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const clientId = urlParams.get("id");

  const { data: rawClient, isLoading: clientLoading, refetch: refetchClient } = useQuery({
    queryKey: ["client", clientId],
    queryFn: async () => {
      const clients = await base44.entities.Clients.filter({ id: clientId });
      return clients[0];
    },
    enabled: !!clientId,
  });
  const client = sanitizeClient(rawClient);

  const { data: syncLogs = [], isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ["syncLogs", clientId],
    queryFn: () => base44.entities.SyncLogs.filter({ client_id: clientId }, "-created_date", 20),
    enabled: !!clientId,
  });

  const { data: events = [], isLoading: eventsLoading, refetch: refetchEvents } = useQuery({
    queryKey: ["crmEvents", clientId],
    queryFn: () => base44.entities.CrmEvents.filter({ client_id: clientId }, "-created_date", 20),
    enabled: !!clientId,
  });

  const { data: deliveryLogs = [], isLoading: deliveryLogsLoading } = useQuery({
    queryKey: ["sharepointDeliveryLogs", clientId],
    queryFn: () => base44.entities.AlteryxDeliveryLog.filter({ client_id: clientId }, "-created_date", 20),
    enabled: !!clientId,
  });

  const [campaignsOpen, setCampaignsOpen] = useState(true);

  const handleUpdate = () => {
    refetchClient();
    refetchLogs();
    refetchEvents();
  };

  if (clientLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-500">Client not found</p>
        <Link to={createPageUrl("Dashboard")}>
          <Button variant="link" className="mt-2">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link to={createPageUrl("Dashboard")}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{client.client_name}</h1>
          <p className="text-sm text-slate-500">{client.crm_type} · {client.auth_type || "No auth configured"}</p>
        </div>
      </div>

      <ConnectionActions client={client} onUpdate={handleUpdate} />
      <SharePointStatusCard client={client} />
      <TeamAssignment client={client} onUpdate={handleUpdate} />
      <div className="border rounded-xl bg-white shadow-sm overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
          onClick={() => setCampaignsOpen(v => !v)}
        >
          <span className="text-sm font-semibold text-slate-700">Campaigns</span>
          {campaignsOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>
        {campaignsOpen && (
          <div className="px-5 pb-5 border-t">
            <div className="pt-4">
              <CampaignsManager client={rawClient} />
            </div>
          </div>
        )}
      </div>
      <InboundReceiptsLog clientId={clientId} />
      <InboundPushManager client={rawClient} />
      <SyncJobsManager client={client} />
      <CredentialsForm client={client} onUpdate={handleUpdate} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <SyncLogsTable logs={syncLogs} isLoading={logsLoading} />
        <EventsTable events={events} isLoading={eventsLoading} />
      </div>

      <SharePointDeliveryTable logs={deliveryLogs} isLoading={deliveryLogsLoading} clientId={clientId} />
    </div>
  );
}