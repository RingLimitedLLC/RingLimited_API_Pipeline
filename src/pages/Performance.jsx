import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Plus, BarChart2, Loader2 } from "lucide-react";
import SimplifiConnectionCard from "@/components/performance/SimplifiConnectionCard";
import { toast } from "sonner";

export default function Performance() {
  const [adding, setAdding] = useState(false);

  const { data: connections = [], isLoading, refetch } = useQuery({
    queryKey: ["performanceConnections"],
    queryFn: async () => {
      const all = await base44.entities.Connections.filter({ connection_type: "simplifi" });
      return all;
    },
  });

  const handleAddSimplifi = async () => {
    setAdding(true);
    try {
      await base44.entities.Connections.create({
        platform_label: "Simplifi",
        connection_type: "simplifi",
        direction: "performance",
        connection_status: "Not Connected",
        client_name: "Ring Digital",
        campaign_name: "Internal Performance",
      });
      toast.success("Simplifi connection created — add credentials to connect");
      refetch();
    } catch (err) {
      toast.error(`Failed to create connection: ${err.message}`);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart2 className="h-6 w-6 text-indigo-500" />
            Performance
          </h1>
          <p className="text-sm text-slate-500 mt-1">Internal ad platform connections — data extracted to Azure SQL</p>
        </div>
        <Button
          onClick={handleAddSimplifi}
          disabled={adding}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          {adding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
          Add Simplifi Connection
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading connections…
        </div>
      )}

      {!isLoading && !connections.length && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <BarChart2 className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No performance connections yet</p>
          <p className="text-xs text-slate-400 mt-1">Add a Simplifi connection to begin extracting campaign data to Azure SQL</p>
        </div>
      )}

      <div className="space-y-4">
        {connections.map((conn) => (
          <SimplifiConnectionCard key={conn.id} connection={conn} onUpdate={refetch} />
        ))}
      </div>
    </div>
  );
}
