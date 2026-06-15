import React from "react";
import { CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollText } from "lucide-react";
import moment from "moment";
import CollapsibleCard from "@/components/ui/CollapsibleCard";

export default function SyncLogsTable({ logs, isLoading }) {
  return (
    <CollapsibleCard title="Sync Logs" icon={ScrollText} defaultOpen={true}>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Type</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Status</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Records</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Error</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array(3).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    {Array(5).fill(0).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-slate-400 text-sm">
                    No sync logs yet
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-0 text-xs">
                        {log.sync_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`border-0 text-xs ${
                        log.status === "Success" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                      }`}>
                        {log.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm font-medium text-slate-700">{log.records_processed || 0}</TableCell>
                    <TableCell className="text-sm text-red-600 max-w-[200px] truncate">{log.error_message || "—"}</TableCell>
                    <TableCell className="text-sm text-slate-500">{moment(log.created_date).fromNow()}</TableCell>
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