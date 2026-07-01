import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, BarChart2, Plug, Loader2, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import CredentialsForm from "@/components/client/CredentialsForm";
import SyncLogsTable from "@/components/client/SyncLogsTable";

export default function SimplifiConnectionCard({ connection, onUpdate }) {
  const [open, setOpen] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const { data: syncLogs = [], refetch: refetchLogs } = useQuery({
    queryKey: ["syncLogs", "simplifi", connection.id],
    queryFn: () => base44.entities.SyncLogs.filter({ connection_id: connection.id }, "-created_date", 20),
  });

  const statusColors = {
    "Connected": "bg-emerald-100 text-emerald-700 border-emerald-200",
    "Error": "bg-red-100 text-red-700 border-red-200",
    "Not Connected": "bg-slate-100 text-slate-500 border-slate-200",
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await base44.functions.invoke("testConnection", { connection_id: connection.id });
      const d = res.data ?? res;
      setTestResult(d);
      if (d.success) {
        toast.success(d.message || "Connected to Simplifi");
        onUpdate?.();
      } else {
        toast.error(d.message || "Connection test failed");
      }
    } catch (err) {
      setTestResult({ success: false, message: err.message });
      toast.error(`Test failed: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this Simplifi connection? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await base44.entities.Connections.delete(connection.id);
      toast.success("Connection deleted");
      onUpdate?.();
    } catch (err) {
      toast.error(`Delete failed: ${err.message}`);
      setDeleting(false);
    }
  };

  const handleUpdate = () => {
    onUpdate?.();
    refetchLogs();
    setTestResult(null);
  };

  return (
    <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="h-9 w-9 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
          <BarChart2 className="h-4 w-4 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800">{connection.platform_label || "Simplifi"}</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-indigo-200 text-indigo-600">
              Performance
            </Badge>
            <Badge className={`text-[10px] px-1.5 py-0 border ${statusColors[connection.connection_status] || statusColors["Not Connected"]}`}>
              {connection.connection_status || "Not Connected"}
            </Badge>
            {connection.simplifi_org_id && (
              <span className="text-[10px] text-slate-400 font-mono">org: {connection.simplifi_org_id}</span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Simplifi programmatic advertising</p>
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
          {/* Credentials */}
          <div className="px-5 py-4">
            <CredentialsForm client={connection} onUpdate={handleUpdate} />
          </div>

          {/* Test connection */}
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Plug className="h-3.5 w-3.5" />
                Connection Test
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={handleTest}
                disabled={testing}
              >
                {testing
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Plug className="h-3 w-3" />}
                {testing ? "Testing…" : "Test Connection"}
              </Button>
            </div>
            {testResult && (
              <div className={`rounded-lg border px-3 py-2.5 text-xs space-y-1 ${testResult.success ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                <div className="flex items-center gap-1.5 font-medium">
                  {testResult.success
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    : <XCircle className="h-4 w-4 text-red-500" />}
                  <span className={testResult.success ? "text-emerald-700" : "text-red-700"}>
                    {testResult.message}
                  </span>
                </div>
                {testResult.org_name && (
                  <p className="text-slate-500 font-mono text-[11px]">Organization: {testResult.org_name} (ID: {testResult.org_id})</p>
                )}
              </div>
            )}
          </div>

          {/* Sync logs */}
          <div className="px-5 py-4">
            <SyncLogsTable logs={syncLogs} />
          </div>
        </div>
      )}
    </div>
  );
}
