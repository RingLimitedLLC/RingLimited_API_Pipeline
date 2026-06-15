import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Bell } from "lucide-react";
import { toast } from "sonner";

const ALERT_TYPES = ["SYNC_FAILED", "DELIVERY_FAILED", "DELIVERY_DELAYED", "WEBHOOK_PROCESSING_FAILED"];
const SEVERITIES = ["Info", "Warning", "Critical"];

const emptyRule = {
  client_id: "",
  alert_type: "SYNC_FAILED",
  severity: "Warning",
  notify_in_app: true,
  notify_email: false,
  email_recipients: "",
  cooldown_minutes: 60,
  is_enabled: true,
};

export default function AlertRulesPage() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyRule);
  const [editId, setEditId] = useState(null);
  const queryClient = useQueryClient();

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["alertRules"],
    queryFn: () => base44.entities.AlertRules.list("-created_date", 100),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Clients.list(),
  });

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]));

  const saveRule = useMutation({
    mutationFn: (data) => editId
      ? base44.entities.AlertRules.update(editId, data)
      : base44.entities.AlertRules.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alertRules"] });
      setOpen(false);
      setEditId(null);
      setForm(emptyRule);
      toast.success(editId ? "Rule updated" : "Rule created");
    },
  });

  const deleteRule = useMutation({
    mutationFn: (id) => base44.entities.AlertRules.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alertRules"] });
      toast.success("Rule deleted");
    },
  });

  const toggleEnabled = async (rule) => {
    await base44.entities.AlertRules.update(rule.id, { is_enabled: !rule.is_enabled });
    queryClient.invalidateQueries({ queryKey: ["alertRules"] });
  };

  const openEdit = (rule) => {
    setForm({ ...rule });
    setEditId(rule.id);
    setOpen(true);
  };

  const openNew = () => {
    setForm(emptyRule);
    setEditId(null);
    setOpen(true);
  };

  const severityColor = { Info: "bg-blue-100 text-blue-700", Warning: "bg-yellow-100 text-yellow-700", Critical: "bg-red-100 text-red-700" };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Alert Rules</h1>
          <p className="text-sm text-slate-500 mt-1">Configure notification rules and routing</p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> New Rule
        </Button>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Alert Type</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Client</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Severity</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Channels</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Recipients</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Cooldown</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Enabled</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-slate-500 font-medium">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array(4).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      {Array(8).fill(0).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : rules.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-slate-400 text-sm">
                      No alert rules configured. Create one to start receiving alerts.
                    </TableCell>
                  </TableRow>
                ) : (
                  rules.map(rule => (
                    <TableRow key={rule.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openEdit(rule)}>
                      <TableCell>
                        <span className="text-sm font-medium text-slate-700">{rule.alert_type?.replace(/_/g, " ")}</span>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {rule.client_id ? (clientMap[rule.client_id]?.client_name || "Unknown") : <span className="text-slate-400 italic">All clients</span>}
                      </TableCell>
                      <TableCell>
                        <Badge className={`border-0 text-xs ${severityColor[rule.severity]}`}>{rule.severity}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {rule.notify_in_app && <Badge className="bg-indigo-100 text-indigo-700 border-0 text-xs">In-App</Badge>}
                          {rule.notify_email && <Badge className="bg-teal-100 text-teal-700 border-0 text-xs">Email</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-500 max-w-[180px] truncate">
                        {rule.email_recipients || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">{rule.cooldown_minutes} min</TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <Switch checked={!!rule.is_enabled} onCheckedChange={() => toggleEnabled(rule)} />
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-400 hover:text-red-500"
                          onClick={() => deleteRule.mutate(rule.id)}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              {editId ? "Edit Alert Rule" : "New Alert Rule"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Alert Type</Label>
                <Select value={form.alert_type} onValueChange={v => setForm(f => ({ ...f, alert_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALERT_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <Select value={form.severity} onValueChange={v => setForm(f => ({ ...f, severity: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Client (optional — leave blank for all)</Label>
              <Select value={form.client_id || "all"} onValueChange={v => setForm(f => ({ ...f, client_id: v === "all" ? "" : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.client_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">In-App</p>
                  <p className="text-xs text-slate-500">Bell notification</p>
                </div>
                <Switch checked={!!form.notify_in_app} onCheckedChange={v => setForm(f => ({ ...f, notify_in_app: v }))} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Email</p>
                  <p className="text-xs text-slate-500">Send email</p>
                </div>
                <Switch checked={!!form.notify_email} onCheckedChange={v => setForm(f => ({ ...f, notify_email: v }))} />
              </div>
            </div>

            {form.notify_email && (
              <div className="space-y-1.5">
                <Label>Email Recipients</Label>
                <Input
                  placeholder="email1@example.com, email2@example.com"
                  value={form.email_recipients || ""}
                  onChange={e => setForm(f => ({ ...f, email_recipients: e.target.value }))}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Cooldown (minutes)</Label>
              <Input
                type="number"
                min={1}
                value={form.cooldown_minutes || 60}
                onChange={e => setForm(f => ({ ...f, cooldown_minutes: parseInt(e.target.value) || 60 }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => saveRule.mutate(form)} disabled={saveRule.isPending}>
              {saveRule.isPending ? "Saving…" : "Save Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}