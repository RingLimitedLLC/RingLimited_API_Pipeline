import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, ArrowUpRight, ArrowDownToLine, Plug, Key, ShieldCheck, Webhook, Send, ShoppingCart, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import ConnectionActions from "./ConnectionActions";
import CredentialsForm from "./CredentialsForm";
import SyncJobsManager from "./SyncJobsManager";
import SyncLogsTable from "./SyncLogsTable";
import EventsTable from "./EventsTable";
import SharePointDeliveryTable from "./SharePointDeliveryTable";
import InboundReceiptsLog from "./InboundReceiptsLog";
import InboundPushManager from "./InboundPushManager";

const PLATFORM_ICONS = {
  woocommerce: ShoppingCart,
  generic_api_key: Key,
  generic_oauth2: ShieldCheck,
  webhook_only: Webhook,
  client_post: Send,
};

const SECRET_FIELDS = ["api_key", "access_token", "refresh_token", "webhook_secret", "woo_consumer_key", "woo_consumer_secret", "inbound_api_key"];

function sanitizeConnection(conn) {
  if (!conn) return conn;
  const safe = { ...conn };
  SECRET_FIELDS.forEach((f) => { if (f in safe) safe[f] = safe[f] ? "••SET••" : ""; });
  return safe;
}

export default function ConnectionCard({ connection: rawConnection, onDelete, onUpdate }) {
  const [open, setOpen] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const connection = sanitizeConnection(rawConnection);

  const isInbound = connection.direction === "inbound";
  const Icon = PLATFORM_ICONS[connection.connection_type] ?? Plug;

  const { data: syncLogs = [], refetch: refetchLogs } = useQuery({
    queryKey: ["syncLogs", "connection", connection.id],
    queryFn: () => base44.entities.SyncLogs.filter({ client_id: connection.client_id }, "-created_date", 10),
    enabled: !isInbound,
  });

  const { data: events = [], refetch: refetchEvents } = useQuery({
    queryKey: ["crmEvents", "connection", connection.id],
    queryFn: () => base44.entities.CrmEvents.filter({ client_id: connection.client_id }, "-created_date", 10),
    enabled: !isInbound,
  });

  const { data: deliveryLogs = [] } = useQuery({
    queryKey: ["deliveryLogs", "connection", connection.id],
    queryFn: () => base44.entities.AlteryxDeliveryLog.filter({ client_id: connection.client_id }, "-created_date", 10),
    enabled: !isInbound,
  });

  const handleUpdate = () => {
    onUpdate?.();
    refetchLogs();
    refetchEvents();
  };

  const handleDelete = async () => {
    if (!confirm(`Delete the ${connection.platform_label} connection for ${connection.campaign_name}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await base44.entities.Connections.delete(connection.id);
      toast.success("Connection deleted");
      onDelete?.();
    } catch (err) {
      toast.error(`Delete failed: ${err.message}`);
      setDeleting(false);
    }
  };

  const statusColors = {
    "Connected": "bg-emerald-100 text-emerald-700 border-emerald-200",
    "Error": "bg-red-100 text-red-700 border-red-200",
    "Not Connected": "bg-slate-100 text-slate-500 border-slate-200",
  };

  return (
    <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${isInbound ? "bg-blue-100" : "bg-slate-100"}`}>
          <Icon className={`h-4 w-4 ${isInbound ? "text-blue-600" : "text-slate-600"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800">{connection.platform_label}</span>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${isInbound ? "border-blue-200 text-blue-600" : "border-slate-200 text-slate-500"}`}>
              {isInbound ? <><ArrowDownToLine className="h-3 w-3 mr-1 inline" />Inbound</> : <><ArrowUpRight className="h-3 w-3 mr-1 inline" />Outbound</>}
            </Badge>
            <Badge className={`text-[10px] px-1.5 py-0 border ${statusColors[connection.connection_status] || statusColors["Not Connected"]}`}>
              {connection.connection_status || "Not Connected"}
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-0.5 truncate">{connection.campaign_name}</p>
        </div>
        <div className="flex items-center gap-2">
          {deleting ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-300 hover:text-red-500"
              onClick={(e) => { e.stopPropagation(); handleDelete(); }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 divide-y divide-slate-100">
          {isInbound ? (
            <>
              <div className="px-5 py-4">
                <InboundPushManager client={rawConnection} />
              </div>
              <div className="px-5 py-4">
                <InboundReceiptsLog clientId={connection.client_id} />
              </div>
              {(connection.connection_type === "client_post" || connection.connection_type === "webhook_only") && (
                <div className="px-5 py-4">
                  <CredentialsForm client={connection} onUpdate={handleUpdate} />
                </div>
              )}
            </>
          ) : (
            <>
              <div className="px-5 py-4">
                <ConnectionActions client={connection} onUpdate={handleUpdate} />
              </div>
              <div className="px-5 py-4">
                <CredentialsForm client={connection} onUpdate={handleUpdate} />
              </div>
              <div className="px-5 py-4">
                <SyncJobsManager client={connection} />
              </div>
              <div className="px-5 py-4">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <SyncLogsTable logs={syncLogs} />
                  <EventsTable events={events} />
                </div>
              </div>
              <div className="px-5 py-4">
                <SharePointDeliveryTable logs={deliveryLogs} clientId={connection.client_id} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
