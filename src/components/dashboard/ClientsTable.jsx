import React, { useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronRight, ExternalLink, Trash2 } from "lucide-react";
import moment from "moment";

const statusColors = {
  "Connected": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Not Connected": "bg-slate-100 text-slate-600 border-slate-200",
  "Error": "bg-red-100 text-red-700 border-red-200",
};

const crmColors = {
  "HubSpot": "bg-orange-100 text-orange-700",
  "Salesforce": "bg-blue-100 text-blue-700",
  "GoHighLevel": "bg-green-100 text-green-700",
  "Other": "bg-slate-100 text-slate-600",
};

export default function ClientsTable({ clients, isLoading, onDeleted }) {
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteConfirm = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await base44.entities.Clients.delete(pendingDelete.id);
      onDeleted?.();
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  return (
    <>
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold">All Clients</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="font-medium text-xs uppercase tracking-wider text-slate-500">Client</TableHead>
                  <TableHead className="font-medium text-xs uppercase tracking-wider text-slate-500">Platform</TableHead>
                  <TableHead className="font-medium text-xs uppercase tracking-wider text-slate-500">Status</TableHead>
                  <TableHead className="font-medium text-xs uppercase tracking-wider text-slate-500">Last Sync</TableHead>
                  <TableHead className="w-10"></TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array(4).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      {Array(6).fill(0).map((_, j) => (
                        <TableCell key={j}><div className="h-4 w-20 bg-slate-100 rounded animate-pulse" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : clients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-slate-400">
                      No clients yet. Add your first client to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  clients.map((client) => (
                    <TableRow key={client.id} className="hover:bg-slate-50/50 transition-colors group">
                      <TableCell>
                        <Link to={createPageUrl(`ClientDetail?id=${client.id}`)} className="font-medium text-slate-900 hover:text-indigo-600 transition-colors">
                          {client.client_name}
                        </Link>
                        {client.api_base_url && (
                          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                            <ExternalLink className="h-3 w-3" />
                            {client.api_base_url}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`${crmColors[client.crm_type] || crmColors["Other"]} border-0 text-xs font-medium`}>
                          {client.crm_type || client.connection_type || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`${statusColors[client.connection_status] || statusColors["Not Connected"]} text-xs`}>
                          <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1.5 ${
                            client.connection_status === "Connected" ? "bg-emerald-500" :
                            client.connection_status === "Error" ? "bg-red-500" : "bg-slate-400"
                          }`} />
                          {client.connection_status || "Not Connected"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {client.last_sync_at ? moment(client.last_sync_at).fromNow() : "Never"}
                      </TableCell>
                      <TableCell>
                        <Link to={createPageUrl(`ClientDetail?id=${client.id}`)}>
                          <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                          onClick={(e) => { e.preventDefault(); setPendingDelete(client); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.client_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the client record and any saved credentials.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
