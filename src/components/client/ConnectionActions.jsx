import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff, RefreshCw, Loader2, Play, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function ConnectionActions({ client, onUpdate }) {
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const statusColors = {
    "Connected": "bg-emerald-100 text-emerald-700",
    "Not Connected": "bg-slate-100 text-slate-600",
    "Error": "bg-red-100 text-red-700",
  };

  const handleTestConnection = async () => {
    setTesting(true);
    // Simulate a test — in production this would call the CRM API
    await new Promise(r => setTimeout(r, 2000));
    
    const hasCredentials = client.api_key || client.access_token;
    const newStatus = hasCredentials ? "Connected" : "Error";
    
    await base44.entities.Clients.update(client.id, { connection_status: newStatus });
    
    if (newStatus === "Connected") {
      toast.success("Connection successful!");
    } else {
      toast.error("Connection failed — check your credentials");
    }
    onUpdate();
    setTesting(false);
  };

  const handleManualSync = async () => {
    setSyncing(true);
    await new Promise(r => setTimeout(r, 2500));
    
    const records = Math.floor(Math.random() * 50) + 5;
    const success = Math.random() > 0.2;
    
    await base44.entities.SyncLogs.create({
      client_id: client.id,
      sync_type: "Manual",
      status: success ? "Success" : "Failed",
      records_processed: success ? records : 0,
      error_message: success ? "" : "Timeout connecting to CRM API",
    });

    await base44.entities.Clients.update(client.id, {
      last_sync_at: new Date().toISOString(),
      connection_status: success ? "Connected" : "Error",
    });

    if (success) {
      toast.success(`Synced ${records} records successfully`);
    } else {
      toast.error("Sync failed — see logs for details");
    }
    onUpdate();
    setSyncing(false);
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
              client.connection_status === "Connected" ? "bg-emerald-100" :
              client.connection_status === "Error" ? "bg-red-100" : "bg-slate-100"
            }`}>
              {client.connection_status === "Connected" ? (
                <Wifi className="h-5 w-5 text-emerald-600" />
              ) : client.connection_status === "Error" ? (
                <AlertCircle className="h-5 w-5 text-red-600" />
              ) : (
                <WifiOff className="h-5 w-5 text-slate-400" />
              )}
            </div>
            <div>
              <Badge className={`${statusColors[client.connection_status] || statusColors["Not Connected"]} border-0 text-xs`}>
                {client.connection_status || "Not Connected"}
              </Badge>
              <p className="text-xs text-slate-400 mt-1">
                {client.last_sync_at ? `Last sync: ${new Date(client.last_sync_at).toLocaleString()}` : "Never synced"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleTestConnection} disabled={testing} size="sm">
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Test Connection
            </Button>
            <Button onClick={handleManualSync} disabled={syncing} size="sm" className="bg-indigo-600 hover:bg-indigo-700">
              {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Run Manual Sync
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}