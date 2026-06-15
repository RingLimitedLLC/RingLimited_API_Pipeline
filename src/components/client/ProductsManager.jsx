import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Loader2, Package } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const STATUS_COLORS = {
  Active: "bg-emerald-100 text-emerald-700",
  "Budget Met": "bg-orange-100 text-orange-700",
  Expired: "bg-slate-100 text-slate-500",
  Paused: "bg-yellow-100 text-yellow-700",
};

const STATUSES = ["Active", "Budget Met", "Expired", "Paused"];
const EMPTY_FORM = { product_name: "", status: "Active", total_lead_budget: "", monthly_lead_budget: "", notes: "" };

function BudgetBar({ received, budget, label }) {
  if (!budget) return null;
  const pct = Math.min(100, Math.round((received / budget) * 100));
  const color = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-orange-400" : "bg-emerald-500";
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[11px] text-slate-500">
        <span>{label}</span>
        <span>{(received || 0).toLocaleString()} / {budget.toLocaleString()}</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function ProductsManager({ campaign }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["campaignProducts", campaign.id],
    queryFn: () => base44.entities.CampaignProducts.filter({ campaign_id: campaign.id }, "product_name"),
  });

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowForm(true); };
  const openEdit = (p) => {
    setEditing(p);
    setForm({
      product_name: p.product_name || "",
      status: p.status || "Active",
      total_lead_budget: p.total_lead_budget ?? "",
      monthly_lead_budget: p.monthly_lead_budget ?? "",
      notes: p.notes || "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.product_name.trim()) return;
    setSaving(true);
    try {
      const data = {
        ...form,
        total_lead_budget: form.total_lead_budget !== "" ? Number(form.total_lead_budget) : null,
        monthly_lead_budget: form.monthly_lead_budget !== "" ? Number(form.monthly_lead_budget) : null,
      };
      if (editing) {
        await base44.entities.CampaignProducts.update(editing.id, data);
      } else {
        await base44.entities.CampaignProducts.create({ ...data, campaign_id: campaign.id, client_id: campaign.client_id });
      }
      queryClient.invalidateQueries({ queryKey: ["campaignProducts", campaign.id] });
      setShowForm(false);
      toast({ title: editing ? "Product updated" : "Product added" });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await base44.entities.CampaignProducts.delete(deleteTarget.id);
    queryClient.invalidateQueries({ queryKey: ["campaignProducts", campaign.id] });
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-3.5 w-3.5 text-indigo-500" />
          <span className="text-xs font-semibold text-slate-700">Target List Products</span>
          <Badge variant="secondary" className="text-xs">{products.length}</Badge>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openCreate}>
          <Plus className="h-3 w-3" /> Add Product
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-slate-400 py-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</div>
      ) : products.length === 0 ? (
        <p className="text-xs text-slate-400">No products yet. Add one to assign inbound push endpoints.</p>
      ) : (
        <div className="space-y-2">
          {products.map(p => (
            <div key={p.id} className="border rounded-lg bg-white p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">{p.product_name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status] || "bg-slate-100 text-slate-500"}`}>{p.status}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(p)}>
                    <Pencil className="h-3 w-3 text-slate-400" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDeleteTarget(p)}>
                    <Trash2 className="h-3 w-3 text-red-400" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <BudgetBar received={p.leads_received_total} budget={p.total_lead_budget} label="Total Budget" />
                <BudgetBar received={p.leads_received_this_month} budget={p.monthly_lead_budget} label="Monthly Budget" />
                {!p.total_lead_budget && !p.monthly_lead_budget && (
                  <p className="text-xs text-slate-400 italic">No budget limits set.</p>
                )}
              </div>
              {p.notes && <p className="text-xs text-slate-400 italic">{p.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Product" : "Add Target List Product"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-500">Product Name *</Label>
              <Input value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))} placeholder="e.g. Lead Lift, Lead Renew" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-500">Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-500">Total Lead Budget</Label>
                <Input type="number" min="0" value={form.total_lead_budget} onChange={e => setForm(f => ({ ...f, total_lead_budget: e.target.value }))} placeholder="e.g. 5000" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-500">Monthly Lead Budget</Label>
                <Input type="number" min="0" value={form.monthly_lead_budget} onChange={e => setForm(f => ({ ...f, monthly_lead_budget: e.target.value }))} placeholder="e.g. 500" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-500">Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes…" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.product_name.trim()}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              {editing ? "Save Changes" : "Add Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>Delete <strong>{deleteTarget?.product_name}</strong>? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}