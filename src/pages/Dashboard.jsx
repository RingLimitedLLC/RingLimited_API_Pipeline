import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Users, Wifi, WifiOff, AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import StatsCards from "@/components/dashboard/StatsCards";
import ClientsTable from "@/components/dashboard/ClientsTable";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";

export default function Dashboard() {
  const [showAdd, setShowAdd] = useState(false);

  const { data: clients = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const all = await base44.entities.Clients.list("-created_date");
      return all.filter((c) => c.status !== "archived");
    },
    retry: 1,
  });

  const connected = clients.filter((c) => c.connection_status === "Connected").length;
  const errored = clients.filter((c) => c.connection_status === "Error").length;
  const notConnected = clients.filter((c) => !c.connection_status || c.connection_status === "Not Connected").length;

  const stats = [
  { label: "Total Clients", value: clients.length, icon: Users, bgColor: "bg-indigo-100", iconColor: "text-indigo-600" },
  { label: "Connected", value: connected, icon: Wifi, bgColor: "bg-emerald-100", iconColor: "text-emerald-600" },
  { label: "Not Connected", value: notConnected, icon: WifiOff, bgColor: "bg-slate-100", iconColor: "text-slate-500" },
  { label: "Errors", value: errored, icon: AlertTriangle, bgColor: "bg-red-100", iconColor: "text-red-600" }];


  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your CRM integrations across all clients</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="hover:bg-indigo-700 bg-[#afd742]">
          <Plus className="h-4 w-4 mr-2" />
          Add Client
        </Button>
      </div>

      <StatsCards stats={stats} />
      {isError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          Failed to load clients: {error?.message || "Unknown error"}
        </div>
      )}
      <ClientsTable clients={clients} isLoading={isLoading} onDeleted={refetch} />
      <OnboardingWizard open={showAdd} onOpenChange={setShowAdd} onCreated={refetch} />
    </div>);

}