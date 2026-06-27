import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import TeamAssignment from "@/components/client/TeamAssignment";
import ConnectionCard from "@/components/client/ConnectionCard";

export default function ClientDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const clientId = urlParams.get("id");
  const queryClient = useQueryClient();

  const { data: client, isLoading: clientLoading, refetch: refetchClient } = useQuery({
    queryKey: ["client", clientId],
    queryFn: async () => {
      const clients = await base44.entities.Clients.filter({ id: clientId });
      return clients[0];
    },
    enabled: !!clientId,
  });

  const { data: connections = [], isLoading: connectionsLoading, refetch: refetchConnections } = useQuery({
    queryKey: ["connections", clientId],
    queryFn: () => base44.entities.Connections.filter({ client_id: clientId }, "-created_date", 50),
    enabled: !!clientId,
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ["campaigns", clientId],
    queryFn: () => base44.entities.Campaigns.filter({ client_id: clientId }, "campaign_name", 50),
    enabled: !!clientId,
  });

  const handleUpdate = () => {
    refetchClient();
    refetchConnections();
  };

  const handleConnectionDelete = () => {
    refetchConnections();
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

  const campaignNames = campaigns.map((c) => c.campaign_name).filter(Boolean);

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
          {campaignNames.length > 0 && (
            <p className="text-sm text-slate-500">{campaignNames.join(" · ")}</p>
          )}
        </div>
      </div>

      <TeamAssignment client={client} onUpdate={handleUpdate} />

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">
            Connections
            {connections.length > 0 && (
              <span className="ml-2 text-xs font-normal text-slate-400">{connections.length}</span>
            )}
          </h2>
        </div>

        {connectionsLoading && (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            <span className="text-sm">Loading connections…</span>
          </div>
        )}

        {!connectionsLoading && connections.length === 0 && (
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
            <p className="text-sm text-slate-500">No connections yet</p>
            <p className="text-xs text-slate-400 mt-1">Use "Add Connection" from the dashboard to add one</p>
          </div>
        )}

        {connections.map((conn) => (
          <ConnectionCard
            key={conn.id}
            connection={conn}
            onUpdate={handleUpdate}
            onDelete={handleConnectionDelete}
          />
        ))}
      </div>
    </div>
  );
}