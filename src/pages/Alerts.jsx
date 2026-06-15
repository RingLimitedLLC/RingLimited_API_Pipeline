import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCheck, CheckCircle, AlertTriangle, Info, XCircle, Link as LinkIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import moment from "moment";
import { toast } from "sonner";

const severityConfig = {
  Info: { color: "bg-blue-100 text-blue-700", icon: Info },
  Warning: { color: "bg-yellow-100 text-yellow-700", icon: AlertTriangle },
  Critical: { color: "bg-red-100 text-red-700", icon: XCircle },
};

const statusConfig = {
  Open: "bg-orange-100 text-orange-700",
  Acknowledged: "bg-purple-100 text-purple-700",
  Resolved: "bg-emerald-100 text-emerald-700",
};

export default function AlertsPage() {
  const [statusFilter, setStatusFilter] = useState("Open");
  const [clientFilter, setClientFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const queryClient = useQueryClient();

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["alerts"],
    queryFn: () => base44.entities.Alerts.list("-created_date", 200),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Clients.list(),
  });

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => base44.auth.me(),
  });

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]));

  const updateAlert = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Alerts.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      queryClient.invalidateQueries({ queryKey: ["openAlerts"] });
    },
  });

  const handleAcknowledge = async (alert) => {
    await updateAlert.mutateAsync({
      id: alert.id,
      data: {
        status: "Acknowledged",
        acknowledged_by: me?.email,
        acknowledged_at: new Date().toISOString(),
      },
    });
    toast.success("Alert acknowledged");
  };

  const handleResolve = async (alert) => {
    await updateAlert.mutateAsync({
      id: alert.id,
      data: {
        status: "Resolved",
        resolved_at: new Date().toISOString(),
      },
    });
    toast.success("Alert resolved");
  };

  const filtered = alerts.filter(a => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (clientFilter !== "all" && a.client_id !== clientFilter) return false;
    if (typeFilter !== "all" && a.alert_type !== typeFilter) return false;
    return true;
  });

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Alerts</h1>
        <p className="text-sm text-slate-500 mt-1">Monitor and manage system alerts</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Open">Open</SelectItem>
            <SelectItem value="Acknowledged">Acknowledged</SelectItem>
            <SelectItem value="Resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>

        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {clients.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.client_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Alert Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="SYNC_FAILED">Sync Failed</SelectItem>
            <SelectItem value="DELIVERY_FAILED">Delivery Failed</SelectItem>
            <SelectItem value="DELIVERY_DELAYED">Delivery Delayed</SelectItem>
            <SelectItem value="WEBHOOK_PROCESSING_FAILED">Webhook Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            {filtered.length} Alert{filtered.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Severity</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Title</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Client</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Type</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Status</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Created</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array(5).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      {Array(7).fill(0).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-slate-400 text-sm">
                      No alerts found
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(alert => {
                    const sev = severityConfig[alert.severity] || severityConfig.Info;
                    const SevIcon = sev.icon;
                    const client = clientMap[alert.client_id];
                    return (
                      <TableRow key={alert.id}>
                        <TableCell>
                          <Badge className={`border-0 text-xs flex items-center gap-1 w-fit ${sev.color}`}>
                            <SevIcon className="h-3 w-3" />
                            {alert.severity}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm font-medium text-slate-800">{alert.title}</p>
                          {alert.message && <p className="text-xs text-slate-500 mt-0.5 max-w-[240px] truncate">{alert.message}</p>}
                        </TableCell>
                        <TableCell>
                          {client ? (
                            <Link to={createPageUrl(`ClientDetail?id=${client.id}`)} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
                              {client.client_name}
                            </Link>
                          ) : <span className="text-slate-400 text-sm">—</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-0 text-xs">
                            {alert.alert_type?.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`border-0 text-xs ${statusConfig[alert.status]}`}>
                            {alert.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-slate-500">{moment(alert.created_date).fromNow()}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {alert.status === "Open" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs px-2"
                                onClick={() => handleAcknowledge(alert)}
                                disabled={updateAlert.isPending}
                              >
                                <CheckCheck className="h-3 w-3 mr-1" /> Ack
                              </Button>
                            )}
                            {alert.status !== "Resolved" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs px-2 text-emerald-600 hover:text-emerald-700 border-emerald-200"
                                onClick={() => handleResolve(alert)}
                                disabled={updateAlert.isPending}
                              >
                                <CheckCircle className="h-3 w-3 mr-1" /> Resolve
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}