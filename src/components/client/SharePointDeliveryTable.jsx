import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { FileOutput, RotateCcw, Loader2 } from "lucide-react";
import moment from "moment";
import CollapsibleCard from "@/components/ui/CollapsibleCard";
import { toast } from "sonner";

const statusColors = {
  Success: "bg-emerald-100 text-emerald-700",
  Failed: "bg-red-100 text-red-700",
  Pending: "bg-yellow-100 text-yellow-700",
  Partial: "bg-orange-100 text-orange-700",
};

export default function SharePointDeliveryTable({ logs = [], isLoading, clientId }) {
  const [retrying, setRetrying] = useState(null);
  const queryClient = useQueryClient();

  const handleRetry = async (log) => {
    setRetrying(log.id);
    const res = await base44.functions.invoke("retryDelivery", {
      log_id: log.id,
      client_id: log.client_id,
    });
    setRetrying(null);
    if (res.data?.success) {
      toast.success("Retry marker placed in SharePoint. Re-push the original data to complete delivery.");
      queryClient.invalidateQueries({ queryKey: ["sharepointDeliveryLogs", clientId] });
    } else {
      toast.error(res.data?.error || "Retry failed");
    }
  };

  return (
    <CollapsibleCard title="SharePoint Delivery Log" icon={FileOutput} defaultOpen={true}>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Batch ID</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Data Type</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Method</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Records</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Status</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Error</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Delivered</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array(3).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    {Array(8).fill(0).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-slate-400 text-sm">
                    No SharePoint deliveries yet
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs font-mono text-slate-500">{log.batch_id || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-0 text-xs capitalize">
                        {log.data_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">{log.delivery_method}</TableCell>
                    <TableCell className="text-sm font-medium text-slate-700">{log.records_sent ?? 0}</TableCell>
                    <TableCell>
                      <Badge className={`border-0 text-xs ${statusColors[log.status] || "bg-slate-100 text-slate-600"}`}>
                        {log.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-red-600 max-w-[180px] truncate">{log.error_message || "—"}</TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {log.delivered_at ? moment(log.delivered_at).fromNow() : moment(log.created_date).fromNow()}
                    </TableCell>
                    <TableCell>
                      {log.status === "Failed" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Retry delivery"
                          disabled={retrying === log.id}
                          onClick={() => handleRetry(log)}
                        >
                          {retrying === log.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                            : <RotateCcw className="h-3.5 w-3.5 text-indigo-500" />}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </CollapsibleCard>
  );
}