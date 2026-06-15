import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowUpDown, ArrowUp, ArrowDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import moment from "moment";

const ALL = "all";

export default function GlobalSyncLog() {
  const [sortField, setSortField] = useState("created_date");
  const [sortDir, setSortDir] = useState("desc");

  // Filters for Sync Logs table
  const [filterClient, setFilterClient] = useState(ALL);
  const [filterType, setFilterType] = useState(ALL);
  const [filterStatus, setFilterStatus] = useState(ALL);
  const [filterDataOps, setFilterDataOps] = useState(ALL);

  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ["allSyncLogs"],
    queryFn: () => base44.entities.SyncLogs.list("-created_date", 200),
  });

  const { data: deliveryLogs = [], isLoading: deliveryLogsLoading } = useQuery({
    queryKey: ["allDeliveryLogs"],
    queryFn: () => base44.entities.AlteryxDeliveryLog.list("-created_date", 100),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Clients.list(),
  });

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]));

  // Unique filter options derived from data
  const clientOptions = useMemo(() => [...new Set(logs.map(l => l.client_id).filter(Boolean))], [logs]);
  const typeOptions = useMemo(() => [...new Set(logs.map(l => l.sync_type).filter(Boolean))], [logs]);
  const statusOptions = useMemo(() => [...new Set(logs.map(l => l.status).filter(Boolean))], [logs]);
  const dataOpsOptions = useMemo(() => [...new Set(clients.map(c => c.dataops_rep).filter(Boolean))], [clients]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 inline text-slate-400" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1 inline text-indigo-500" />
      : <ArrowDown className="h-3 w-3 ml-1 inline text-indigo-500" />;
  };

  const hasActiveFilter = filterClient !== ALL || filterType !== ALL || filterStatus !== ALL || filterDataOps !== ALL;

  const filteredSortedLogs = useMemo(() => {
    let filtered = logs.filter(log => {
      const client = clientMap[log.client_id];
      if (filterClient !== ALL && log.client_id !== filterClient) return false;
      if (filterType !== ALL && log.sync_type !== filterType) return false;
      if (filterStatus !== ALL && log.status !== filterStatus) return false;
      if (filterDataOps !== ALL && client?.dataops_rep !== filterDataOps) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      let aVal, bVal;
      if (sortField === "client_name") {
        aVal = clientMap[a.client_id]?.client_name || "";
        bVal = clientMap[b.client_id]?.client_name || "";
      } else if (sortField === "dataops_rep") {
        aVal = clientMap[a.client_id]?.dataops_rep || "";
        bVal = clientMap[b.client_id]?.dataops_rep || "";
      } else if (sortField === "sync_type") {
        aVal = a.sync_type || "";
        bVal = b.sync_type || "";
      } else if (sortField === "status") {
        aVal = a.status || "";
        bVal = b.status || "";
      } else {
        aVal = a.created_date || "";
        bVal = b.created_date || "";
      }
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [logs, clientMap, filterClient, filterType, filterStatus, filterDataOps, sortField, sortDir]);

  // Delivery logs — simple sort only (no filter change requested)
  const sortedDeliveryLogs = useMemo(() => {
    return [...deliveryLogs].sort((a, b) => {
      const aVal = a.created_date || "";
      const bVal = b.created_date || "";
      return aVal < bVal ? 1 : -1;
    });
  }, [deliveryLogs]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">API Activity Log</h1>
        <p className="text-sm text-slate-500 mt-1">All sync activity across every client</p>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base font-semibold">All Sync Logs</CardTitle>
            {hasActiveFilter && (
              <Button variant="ghost" size="sm" className="text-xs text-slate-500 h-7 gap-1"
                onClick={() => { setFilterClient(ALL); setFilterType(ALL); setFilterStatus(ALL); setFilterDataOps(ALL); }}>
                <X className="h-3 w-3" /> Clear filters
              </Button>
            )}
          </div>
          {/* Filter Row */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Select value={filterClient} onValueChange={setFilterClient}>
              <SelectTrigger className="h-8 text-xs w-44">
                <SelectValue placeholder="All Clients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All Clients</SelectItem>
                {clientOptions.map(id => (
                  <SelectItem key={id} value={id}>{clientMap[id]?.client_name || id}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-8 text-xs w-36">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All Types</SelectItem>
                {typeOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 text-xs w-36">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All Statuses</SelectItem>
                {statusOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterDataOps} onValueChange={setFilterDataOps}>
              <SelectTrigger className="h-8 text-xs w-44">
                <SelectValue placeholder="All DataOps Reps" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All DataOps Reps</SelectItem>
                {dataOpsOptions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium cursor-pointer select-none" onClick={() => handleSort("client_name")}>
                    Client <SortIcon field="client_name" />
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium cursor-pointer select-none" onClick={() => handleSort("dataops_rep")}>
                    DataOps Rep <SortIcon field="dataops_rep" />
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium cursor-pointer select-none" onClick={() => handleSort("sync_type")}>
                    Type <SortIcon field="sync_type" />
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium cursor-pointer select-none" onClick={() => handleSort("status")}>
                    Status <SortIcon field="status" />
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Records</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Error</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium cursor-pointer select-none" onClick={() => handleSort("created_date")}>
                    Date <SortIcon field="created_date" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logsLoading ? (
                  Array(5).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      {Array(7).fill(0).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredSortedLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-slate-400 text-sm">
                      No sync logs match the current filters
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSortedLogs.map((log) => {
                    const client = clientMap[log.client_id];
                    return (
                      <TableRow key={log.id}>
                        <TableCell>
                          {client ? (
                            <Link to={createPageUrl(`ClientDetail?id=${client.id}`)} className="font-medium text-slate-800 hover:text-indigo-600 transition-colors">
                              {client.client_name}
                            </Link>
                          ) : (
                            <span className="text-slate-400 text-sm">Unknown</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">{client?.dataops_rep || <span className="text-slate-300">—</span>}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-0 text-xs">
                            {log.sync_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`border-0 text-xs ${log.status === "Success" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                            {log.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm font-medium text-slate-700">{log.records_processed ?? 0}</TableCell>
                        <TableCell className="text-sm text-red-600 max-w-[220px] truncate">{log.error_message || "—"}</TableCell>
                        <TableCell className="text-sm text-slate-500">{moment(log.created_date).fromNow()}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">SharePoint Delivery Log</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Client</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Data Type</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Method</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Records</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Status</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Error</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveryLogsLoading ? (
                  Array(5).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      {Array(7).fill(0).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : sortedDeliveryLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-slate-400 text-sm">
                      No SharePoint delivery logs yet
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedDeliveryLogs.map((log) => {
                    const client = clientMap[log.client_id];
                    const statusColors = {
                      Success: "bg-emerald-100 text-emerald-700",
                      Failed: "bg-red-100 text-red-700",
                      Pending: "bg-yellow-100 text-yellow-700",
                      Partial: "bg-orange-100 text-orange-700",
                    };
                    return (
                      <TableRow key={log.id}>
                        <TableCell>
                          {client ? (
                            <Link to={createPageUrl(`ClientDetail?id=${client.id}`)} className="font-medium text-slate-800 hover:text-indigo-600 transition-colors">
                              {client.client_name}
                            </Link>
                          ) : (
                            <span className="text-slate-400 text-sm">Unknown</span>
                          )}
                        </TableCell>
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
                        <TableCell className="text-sm text-red-600 max-w-[220px] truncate">{log.error_message || "—"}</TableCell>
                        <TableCell className="text-sm text-slate-500">{moment(log.created_date).fromNow()}</TableCell>
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