import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Send, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import moment from "moment";
import { toast } from "sonner";

const statusConfig = {
  Healthy: { color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  Delayed: { color: "bg-yellow-100 text-yellow-700", dot: "bg-yellow-500" },
  Failed:  { color: "bg-red-100 text-red-700", dot: "bg-red-500" },
};

export default function SharePointStatusCard({ client }) {
  const config = statusConfig[client?.delivery_status] || { color: "bg-slate-100 text-slate-500", dot: "bg-slate-400" };
  const [checking, setChecking] = useState(false);
  const [healthResult, setHealthResult] = useState(null);

  const handleHealthCheck = async () => {
    setChecking(true);
    setHealthResult(null);
    const res = await base44.functions.invoke("checkSharePointHealth", {});
    const result = res.data;
    setHealthResult(result);
    setChecking(false);
    if (result.healthy) {
      toast.success(`SharePoint connected — ${result.tenant}`);
    } else {
      toast.error(`SharePoint connection failed: ${result.error}`);
    }
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-violet-100 flex items-center justify-center">
            <Send className="h-4 w-4 text-violet-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">SharePoint Delivery</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Last delivery:{" "}
              {client?.last_delivery_to_alteryx_at
                ? moment(client.last_delivery_to_alteryx_at).fromNow()
                : "Never"}
            </p>
            {healthResult && (
              <p className={`text-xs mt-0.5 flex items-center gap-1 ${healthResult.healthy ? "text-emerald-600" : "text-red-500"}`}>
                {healthResult.healthy
                  ? <><CheckCircle2 className="h-3 w-3" /> Connected to {healthResult.tenant}</>
                  : <><XCircle className="h-3 w-3" /> {healthResult.error}</>}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-8 gap-1.5"
            onClick={handleHealthCheck}
            disabled={checking}
          >
            {checking
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : healthResult?.healthy
                ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                : <Send className="h-3.5 w-3.5" />}
            {checking ? "Checking…" : "Test Connection"}
          </Button>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${config.dot}`} />
            <Badge className={`border-0 text-xs ${config.color}`}>
              {client?.delivery_status || "Not Set"}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}