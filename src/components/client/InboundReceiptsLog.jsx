import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, startOfDay, endOfDay, startOfMonth, isWithinInterval, parseISO } from "date-fns";
import { Calendar, ChevronDown, ChevronUp, Package, CheckCircle2, XCircle, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


export default function InboundReceiptsLog({ clientId }) {
  const [open, setOpen] = useState(false);
  const [quickRange, setQuickRange] = useState("30");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const { data: allLogs = [], isLoading } = useQuery({
    queryKey: ["inboundLogs", clientId],
    queryFn: () =>
      base44.entities.AlteryxDeliveryLog.filter(
        { client_id: clientId, delivery_method: "API Push" },
        "-created_date",
        500
      ),
    enabled: !!clientId,
  });

  const { dateStart, dateEnd } = useMemo(() => {
    if (quickRange === "custom") {
      return {
        dateStart: customStart ? startOfDay(parseISO(customStart)) : null,
        dateEnd: customEnd ? endOfDay(parseISO(customEnd)) : null,
      };
    }
    const days = parseInt(quickRange, 10);
    return {
      dateStart: startOfDay(subDays(new Date(), days)),
      dateEnd: endOfDay(new Date()),
    };
  }, [quickRange, customStart, customEnd]);

  const filtered = useMemo(() => {
    if (!dateStart || !dateEnd) return allLogs;
    return allLogs.filter(log => {
      const d = parseISO(log.delivered_at || log.created_date);
      return isWithinInterval(d, { start: dateStart, end: dateEnd });
    });
  }, [allLogs, dateStart, dateEnd]);

  const totalRecords = useMemo(
    () => filtered.reduce((sum, l) => sum + (l.records_sent || 0), 0),
    [filtered]
  );
  const successCount = filtered.filter(l => l.status === "Success").length;
  const failedCount = filtered.filter(l => l.status === "Failed").length;

  const thisMonthRecords = useMemo(() => {
    const monthStart = startOfMonth(new Date());
    const monthEnd = endOfDay(new Date());
    return allLogs
      .filter(l => l.status === "Success")
      .filter(l => {
        const d = parseISO(l.delivered_at || l.created_date);
        return isWithinInterval(d, { start: monthStart, end: monthEnd });
      })
      .reduce((sum, l) => sum + (l.records_sent || 0), 0);
  }, [allLogs]);

  return (
    <div className="border rounded-xl bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-indigo-500" />
          <span className="text-sm font-semibold text-slate-700">Inbound Records Log</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {open && (
        <div className="border-t">
          {/* Filters */}
          <div className="px-5 py-4 bg-slate-50 border-b flex flex-wrap items-center gap-3">
            <Filter className="h-4 w-4 text-slate-400 shrink-0" />
            <Select value={quickRange} onValueChange={setQuickRange}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>

            {quickRange === "custom" && (
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <Input
                  type="date"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  className="h-8 text-xs w-36"
                />
                <span className="text-xs text-slate-400">to</span>
                <Input
                  type="date"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="h-8 text-xs w-36"
                />
              </div>
            )}
          </div>

          {/* Summary stats */}
          <div className="px-5 py-4 grid grid-cols-4 gap-4 border-b">
            <div className="text-center">
              <p className="text-2xl font-bold text-indigo-600">{thisMonthRecords.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-0.5">Records This Month</p>
              <p className="text-xs text-slate-400">{format(new Date(), "MMMM yyyy")}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-800">{totalRecords.toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-0.5">Total Records (period)</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-600">{successCount}</p>
              <p className="text-xs text-slate-500 mt-0.5">Successful Pushes</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-500">{failedCount}</p>
              <p className="text-xs text-slate-500 mt-0.5">Failed Pushes</p>
            </div>
          </div>

          {/* Log table */}
          {isLoading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Loading logs…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No inbound records found for this period.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                    <th className="px-5 py-3 text-left">Date & Time</th>
                    <th className="px-5 py-3 text-left">Batch ID</th>
                    <th className="px-5 py-3 text-right">Records</th>
                    <th className="px-5 py-3 text-left">Status</th>
                    <th className="px-5 py-3 text-left">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 text-slate-600 whitespace-nowrap">
                        {log.delivered_at
                          ? format(parseISO(log.delivered_at), "MMM d, yyyy h:mm a")
                          : format(parseISO(log.created_date), "MMM d, yyyy h:mm a")}
                      </td>
                      <td className="px-5 py-3 text-slate-400 font-mono text-xs whitespace-nowrap">
                        {log.batch_id || "—"}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-800">
                        {(log.records_sent || 0).toLocaleString()}
                      </td>
                      <td className="px-5 py-3">
                        {log.status === "Success" ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-0 gap-1">
                            <CheckCircle2 className="h-3 w-3" />Success
                          </Badge>
                        ) : log.status === "Failed" ? (
                          <Badge className="bg-red-100 text-red-700 border-0 gap-1">
                            <XCircle className="h-3 w-3" />Failed
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-100 text-slate-500 border-0">{log.status}</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs text-red-500 max-w-xs truncate">
                        {log.error_message || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}