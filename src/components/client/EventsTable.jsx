import React, { useState } from "react";
import { CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Eye, Webhook } from "lucide-react";
import moment from "moment";
import CollapsibleCard from "@/components/ui/CollapsibleCard";

export default function EventsTable({ events, isLoading }) {
  const [viewPayload, setViewPayload] = useState(null);

  const formatPayload = (raw) => {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  };

  return (
    <>
      <CollapsibleCard title="Recent Webhook Events" icon={Webhook} defaultOpen={false}>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Event Type</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Processed</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Error</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Date</TableHead>
                  <TableHead className="w-10"></TableHead>
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
                ) : events.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-slate-400 text-sm">
                      No webhook events yet
                    </TableCell>
                  </TableRow>
                ) : (
                  events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="font-medium text-sm text-slate-700">{event.event_type}</TableCell>
                      <TableCell>
                        <Badge className={`border-0 text-xs ${
                          event.processed ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        }`}>
                          {event.processed ? "Yes" : "Pending"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-red-600 max-w-[200px] truncate">{event.error_message || "—"}</TableCell>
                      <TableCell className="text-sm text-slate-500">{moment(event.created_date).fromNow()}</TableCell>
                      <TableCell>
                        {event.raw_payload && (
                          <button onClick={() => setViewPayload(event.raw_payload)} className="text-slate-400 hover:text-indigo-600 transition-colors">
                            <Eye className="h-4 w-4" />
                          </button>
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

      <Dialog open={!!viewPayload} onOpenChange={() => setViewPayload(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Raw Payload</DialogTitle>
          </DialogHeader>
          <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs overflow-auto max-h-96">
            {viewPayload && formatPayload(viewPayload)}
          </pre>
        </DialogContent>
      </Dialog>
    </>
  );
}