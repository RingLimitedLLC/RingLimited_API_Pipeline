import React, { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  CheckCircle2, AlertTriangle, XCircle, RefreshCw,
  Clock, ChevronRight, Activity
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

function HealthDot({ status }) {
  if (status === "Healthy") return <span className="inline-block h-3 w-3 rounded-full bg-emerald-500 ring-4 ring-emerald-100" />;
  if (status === "Delayed") return <span className="inline-block h-3 w-3 rounded-full bg-amber-400 ring-4 ring-amber-100 animate-pulse" />;
  if (status === "Failed") return <span className="inline-block h-3 w-3 rounded-full bg-red-500 ring-4 ring-red-100 animate-pulse" />;
  return <span className="inline-block h-3 w-3 rounded-full bg-slate-300 ring-4 ring-slate-100" />;
}

function SyncStatusBadge({ status }) {
  if (status === "Success") return <Badge className="bg-emerald-100 text-emerald-700 border-0 gap-1"><CheckCircle2 className="h-3 w-3" />Success</Badge>;
  if (status === "Failed") return <Badge className="bg-red-100 text-red-700 border-0 gap-1"><XCircle className="h-3 w-3" />Failed</Badge>;
  return <Badge className="bg-slate-100 text-slate-500 border-0 gap-1"><Clock className="h-3 w-3" />Never Run</Badge>;
}

function DeliveryBadge({ status }) {
  if (status === "Healthy") return <Badge className="bg-emerald-100 text-emerald-700 border-0">Healthy</Badge>;
  if (status === "Delayed") return <Badge className="bg-amber-100 text-amber-700 border-0">Delayed</Badge>;
  if (status === "Failed") return <Badge className="bg-red-100 text-red-700 border-0">Failed</Badge>;
  return <Badge className="bg-slate-100 text-slate-400 border-0">No Data</Badge>;
}

export default function SyncHealth() {
  const { data: clients = [], isLoading: loadingClients } = useQuery({
    queryKey: ["clients-health"],
    queryFn: () => base44.entities.Clients.list("-updated_date"),
    refetchInterval: 60000,
  });

  const { data: syncLogs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ["sync-logs-health"],
    queryFn: () => base44.entities.SyncLogs.list("-created_date", 200),
    refetchInterval: 60000,
  });

  const { data: deliveryLogs = [], isLoading: loadingDelivery } = useQuery({
    queryKey: ["delivery-logs-health"],
    queryFn: () => base44.entities.AlteryxDeliveryLog.list("-created_date", 200),
    refetchInterval: 60000,
  });

  const isLoading = loadingClients || loadingLogs || loadingDelivery;

  // Per-client aggregated health
  const clientHealth = useMemo(() => {
    return clients.map(client => {
      const clientSyncLogs = syncLogs.filter(l => l.client_id === client.id);
      const clientDeliveryLogs = deliveryLogs.filter(l => l.client_id === client.id);

      const recentSyncErrors = clientSyncLogs
        .filter(l => l.status === "Failed")
        .slice(0, 3);

      const recentDeliveryErrors = clientDeliveryLogs
        .filter(l => l.status === "Failed")
        .slice(0, 3);

      const lastSync = clientSyncLogs[0] || null;
      const lastDelivery = clientDeliveryLogs[0] || null;

      // Compute overall health: worst of delivery_status + last sync
      let overallHealth = "Unknown";
      if (client.delivery_status === "Failed" || (lastSync && lastSync.status === "Failed")) {
        overallHealth = "Critical";
      } else if (client.delivery_status === "Delayed") {
        overallHealth = "Warning";
      } else if (client.delivery_status === "Healthy" && (!lastSync || lastSync.status === "Success")) {
        overallHealth = "Healthy";
      } else if (client.delivery_status === "Healthy") {
        overallHealth = "Healthy";
      } else if (lastSync && lastSync.status === "Success") {
        overallHealth = "Healthy";
      }

      return {
        client,
        overallHealth,
        lastSync,
        lastDelivery,
        recentSyncErrors,
        recentDeliveryErrors,
        totalErrors: recentSyncErrors.length + recentDeliveryErrors.length,
      };
    });
  }, [clients, syncLogs, deliveryLogs]);

  const summary = useMemo(() => ({
    healthy: clientHealth.filter(c => c.overallHealth === "Healthy").length,
    warning: clientHealth.filter(c => c.overallHealth === "Warning").length,
    critical: clientHealth.filter(c => c.overallHealth === "Critical").length,
    unknown: clientHealth.filter(c => c.overallHealth === "Unknown").length,
  }), [clientHealth]);

  // Sort: critical first, then warning, then healthy/unknown
  const sorted = useMemo(() => {
    const order = { Critical: 0, Warning: 1, Unknown: 2, Healthy: 3 };
    return [...clientHealth].sort((a, b) => (order[a.overallHealth] ?? 4) - (order[b.overallHealth] ?? 4));
  }, [clientHealth]);

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center gap-3 text-slate-400">
        <RefreshCw className="h-5 w-5 animate-spin" />
        <span>Loading sync health data…</span>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Activity className="h-6 w-6 text-indigo-500" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Sync Health</h1>
          <p className="text-sm text-slate-500 mt-0.5">Live overview of delivery and sync status across all clients</p>
        </div>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle2 className="h-8 w-8 text-emerald-500 shrink-0" />
          <div>
            <p className="text-2xl font-bold text-emerald-700">{summary.healthy}</p>
            <p className="text-xs text-emerald-600 font-medium">Healthy</p>
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="h-8 w-8 text-amber-400 shrink-0" />
          <div>
            <p className="text-2xl font-bold text-amber-700">{summary.warning}</p>
            <p className="text-xs text-amber-600 font-medium">Warning</p>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <XCircle className="h-8 w-8 text-red-500 shrink-0" />
          <div>
            <p className="text-2xl font-bold text-red-700">{summary.critical}</p>
            <p className="text-xs text-red-600 font-medium">Critical</p>
          </div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <Clock className="h-8 w-8 text-slate-400 shrink-0" />
          <div>
            <p className="text-2xl font-bold text-slate-600">{summary.unknown}</p>
            <p className="text-xs text-slate-500 font-medium">No Data</p>
          </div>
        </div>
      </div>

      {/* Client health table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Client Status</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {sorted.map(({ client, overallHealth, lastSync, lastDelivery, recentSyncErrors, recentDeliveryErrors }) => (
            <div key={client.id} className="p-5 space-y-3">

              {/* Client row */}
              <div className="flex items-center gap-4">
                <HealthDot status={
                  overallHealth === "Healthy" ? "Healthy" :
                  overallHealth === "Warning" ? "Delayed" :
                  overallHealth === "Critical" ? "Failed" : null
                } />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800 text-sm">{client.client_name}</span>
                    <Badge variant="outline" className="text-xs">{client.crm_type}</Badge>
                  </div>
                  <div className="flex items-center gap-4 mt-1 flex-wrap">
                    <span className="text-xs text-slate-400">
                      Last sync: {lastSync
                        ? formatDistanceToNow(new Date(lastSync.created_date), { addSuffix: true })
                        : "Never"}
                    </span>
                    <span className="text-xs text-slate-400">
                      Last delivery: {lastDelivery
                        ? formatDistanceToNow(new Date(lastDelivery.created_date), { addSuffix: true })
                        : "Never"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <span>Sync:</span>
                    <SyncStatusBadge status={lastSync?.status || "Never Run"} />
                  </div>
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <span>Delivery:</span>
                    <DeliveryBadge status={client.delivery_status} />
                  </div>
                  <Link
                    to={`/ClientDetail?id=${client.id}`}
                    className="ml-2 text-slate-400 hover:text-indigo-600 transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>

              {/* Error details */}
              {(recentSyncErrors.length > 0 || recentDeliveryErrors.length > 0) && (
                <div className="ml-7 space-y-1.5">
                  {recentSyncErrors.map((err, i) => (
                    <div key={i} className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                      <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <span className="text-xs font-medium text-red-700">Sync error</span>
                        {err.error_message && (
                          <p className="text-xs text-red-600 truncate">{err.error_message}</p>
                        )}
                        <p className="text-xs text-red-400">
                          {formatDistanceToNow(new Date(err.created_date), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))}
                  {recentDeliveryErrors.map((err, i) => (
                    <div key={i} className="flex items-start gap-2 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <span className="text-xs font-medium text-orange-700">Delivery error</span>
                        {err.error_message && (
                          <p className="text-xs text-orange-600 truncate">{err.error_message}</p>
                        )}
                        <p className="text-xs text-orange-400">
                          {formatDistanceToNow(new Date(err.created_date), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {sorted.length === 0 && (
            <div className="p-10 text-center text-slate-400 text-sm">No clients found.</div>
          )}
        </div>
      </div>
    </div>
  );
}