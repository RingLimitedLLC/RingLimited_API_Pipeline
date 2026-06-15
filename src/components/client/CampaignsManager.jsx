import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Flag, ChevronDown, ChevronUp, Zap, Plus, Pencil, Trash2, Filter, Key, RefreshCw, Copy, Check, Eye, EyeOff, AlertCircle, GripVertical } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import ProductsManager from "@/components/client/ProductsManager";


const STATUS_COLORS = {
  Active: "bg-emerald-100 text-emerald-700",
  Completed: "bg-slate-100 text-slate-500",
  Paused: "bg-yellow-100 text-yellow-700",
  Planned: "bg-blue-100 text-blue-700",
};

const STATUSES = ["Active", "Completed", "Paused", "Planned"];

const EMPTY_FORM = { campaign_name: "", status: "Active", start_date: "", end_date: "", notes: "" };
const FIELD_TYPES = ["string", "number", "boolean", "date"];
const ENDPOINT_URL = "https://pipeline.ring.digital/api/apps/67b8f9ccbc57b4f9994fb5c3/functions/inboundPush";

function generateApiKey() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "rpk_";
  for (let i = 0; i < 40; i++) key += chars[Math.floor(Math.random() * chars.length)];
  return key;
}

export default function CampaignsManager({ client }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [convKeyVisible, setConvKeyVisible] = useState({});
  const [convKeyCopied, setConvKeyCopied] = useState(null);
  const [generatingConvKey, setGeneratingConvKey] = useState(null);
  const [convFields, setConvFields] = useState({});          // campaignId -> fields array
  const [savingConvFields, setSavingConvFields] = useState(null);
  const [convFieldsCopied, setConvFieldsCopied] = useState(null);

  const getConvFields = (campaign) => {
    if (convFields[campaign.id] !== undefined) return convFields[campaign.id];
    try { return JSON.parse(campaign.inbound_conversion_field_schema || "[]"); } catch { return []; }
  };

  const setConvFieldsForCampaign = (campaignId, fields) =>
    setConvFields(prev => ({ ...prev, [campaignId]: fields }));

  const addConvField = (campaignId) =>
    setConvFieldsForCampaign(campaignId, [...getConvFieldsById(campaignId), { name: "", type: "string", required: true }]);

  const getConvFieldsById = (campaignId) => {
    const c = campaigns.find(x => x.id === campaignId);
    return convFields[campaignId] !== undefined ? convFields[campaignId] : (c ? (() => { try { return JSON.parse(c.inbound_conversion_field_schema || "[]"); } catch { return []; } })() : []);
  };

  const updateConvField = (campaignId, idx, key, val) =>
    setConvFieldsForCampaign(campaignId, getConvFieldsById(campaignId).map((x, i) => i === idx ? { ...x, [key]: val } : x));

  const removeConvField = (campaignId, idx) =>
    setConvFieldsForCampaign(campaignId, getConvFieldsById(campaignId).filter((_, i) => i !== idx));

  const saveConvFields = async (campaign) => {
    setSavingConvFields(campaign.id);
    const fields = getConvFieldsById(campaign.id).filter(f => f.name.trim());
    await base44.entities.Campaigns.update(campaign.id, { inbound_conversion_field_schema: JSON.stringify(fields) });
    queryClient.invalidateQueries({ queryKey: ["campaigns", client.id] });
    setSavingConvFields(null);
    toast({ title: "Conversion fields saved" });
  };

  const buildConvInstructions = (campaign) => {
    const fields = getConvFieldsById(campaign.id);
    const fieldLines = fields.length > 0
      ? fields.map(f => `  - ${f.name} (${f.type})${f.required ? " [required]" : " [optional]"}`).join("\n")
      : "  - No specific fields defined — send any fields needed.";
    const exampleRecord = fields.length > 0
      ? "{" + fields.map(f => `"${f.name}": ""`).join(", ") + "}"
      : '{ "field1": "value1" }';
    return `=== Ring Data Ops — Conversion Inbound Push ===
Campaign: ${campaign.campaign_name}
Client: ${client.client_name}

ENDPOINT
POST ${ENDPOINT_URL}

AUTHENTICATION
  Authorization: Bearer ${campaign.inbound_conversion_api_key}

REQUEST BODY (JSON)
{
  "campaign_id": "${campaign.id}",
  "list_type": "conversion",
  "campaign_name": "${campaign.campaign_name}",
  "filename": "T_X_${client.client_name}_YYYY-MM-DD_Conversion",
  "records": [${exampleRecord}]
}

FIELDS
${fieldLines}

For questions, contact your DataOps representative.`;
  };

  const copyConvInstructions = async (campaign) => {
    await navigator.clipboard.writeText(buildConvInstructions(campaign));
    setConvFieldsCopied(campaign.id);
    setTimeout(() => setConvFieldsCopied(null), 2500);
    toast({ title: "Copied!", description: "Conversion instructions copied." });
  };

  // Filters
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const { data: campaigns = [], isLoading: loadingCampaigns } = useQuery({
    queryKey: ["campaigns", client.id],
    queryFn: () => base44.entities.Campaigns.filter({ client_id: client.id }, "-created_date"),
  });

  const { data: syncJobs = [] } = useQuery({
    queryKey: ["syncJobs", client.id],
    queryFn: () => base44.entities.SyncJobs.filter({ client_id: client.id }, "job_name"),
  });

  const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  const pipelinesByCampaign = (campaignName) => syncJobs.filter(j => j.campaign_name === campaignName);

  const copyConvKey = async (key, id) => {
    await navigator.clipboard.writeText(key);
    setConvKeyCopied(id);
    setTimeout(() => setConvKeyCopied(null), 2500);
    toast({ title: "Copied!", description: "Conversion API key copied." });
  };

  const handleGenerateConvKey = async (campaign) => {
    setGeneratingConvKey(campaign.id);
    const newKey = generateApiKey();
    await base44.entities.Campaigns.update(campaign.id, { inbound_conversion_api_key: newKey });
    queryClient.invalidateQueries({ queryKey: ["campaigns", client.id] });
    setGeneratingConvKey(null);
    toast({ title: "Conversion API key generated" });
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (c, e) => {
    e.stopPropagation();
    setEditing(c);
    setForm({
      campaign_name: c.campaign_name || "",
      status: c.status || "Active",
      start_date: c.start_date || "",
      end_date: c.end_date || "",
      notes: c.notes || "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.campaign_name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await base44.entities.Campaigns.update(editing.id, form);
      } else {
        await base44.entities.Campaigns.create({ ...form, client_id: client.id });
      }
      queryClient.invalidateQueries({ queryKey: ["campaigns", client.id] });
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await base44.entities.Campaigns.delete(deleteTarget.id);
    queryClient.invalidateQueries({ queryKey: ["campaigns", client.id] });
    setDeleteTarget(null);
  };

  const filteredCampaigns = useMemo(() => {
    return campaigns.filter(c => {
      if (filterStatus !== "all" && c.status !== filterStatus) return false;
      if (filterStart && c.start_date && c.start_date < filterStart) return false;
      if (filterEnd && c.end_date && c.end_date > filterEnd) return false;
      return true;
    });
  }, [campaigns, filterStatus, filterStart, filterEnd]);

  const activeFilters = (filterStatus !== "all" ? 1 : 0) + (filterStart ? 1 : 0) + (filterEnd ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flag className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700">Campaigns</h3>
          <Badge variant="secondary" className="text-xs">{filteredCampaigns.length}{filteredCampaigns.length !== campaigns.length ? ` / ${campaigns.length}` : ""}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setShowFilters(v => !v)}
          >
            <Filter className="h-3 w-3" />
            Filter
            {activeFilters > 0 && <span className="ml-1 bg-indigo-500 text-white rounded-full h-4 w-4 flex items-center justify-center text-[10px]">{activeFilters}</span>}
          </Button>
          <Button size="sm" className="h-7 text-xs gap-1" onClick={openCreate}>
            <Plus className="h-3 w-3" /> New Campaign
          </Button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-slate-50 border rounded-lg p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Start Date From</Label>
              <Input type="date" className="h-8 text-xs" value={filterStart} onChange={e => setFilterStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">End Date To</Label>
              <Input type="date" className="h-8 text-xs" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} />
            </div>
          </div>
          {activeFilters > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-500" onClick={() => { setFilterStatus("all"); setFilterStart(""); setFilterEnd(""); }}>
              Clear filters
            </Button>
          )}
        </div>
      )}

      {/* List */}
      {loadingCampaigns ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading campaigns…
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <p className="text-sm text-slate-400 py-2">
          {campaigns.length === 0 ? "No campaigns yet. Click \"New Campaign\" to create one." : "No campaigns match the current filters."}
        </p>
      ) : (
        <div className="space-y-2">
          {filteredCampaigns.map(c => {
            const pipelines = pipelinesByCampaign(c.campaign_name);
            const isOpen = expanded[c.id];
            return (
              <div key={c.id} className="border rounded-lg bg-white overflow-hidden">
                <div className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
                  <button
                    type="button"
                    className="flex items-center gap-3 min-w-0 flex-1 text-left"
                    onClick={() => toggle(c.id)}
                  >
                    <p className="text-sm font-medium text-slate-800 truncate">{c.campaign_name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLORS[c.status] || "bg-slate-100 text-slate-500"}`}>
                      {c.status}
                    </span>
                    {(c.start_date || c.end_date) && (
                      <span className="text-xs text-slate-400 hidden sm:block shrink-0">
                        {c.start_date ? format(new Date(c.start_date + "T12:00:00"), "MMM d, yyyy") : "—"}
                        {" → "}
                        {c.end_date ? format(new Date(c.end_date + "T12:00:00"), "MMM d, yyyy") : "ongoing"}
                      </span>
                    )}
                  </button>
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    <span className="text-xs text-slate-400">{pipelines.length} pipeline{pipelines.length !== 1 ? "s" : ""}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => openEdit(c, e)}>
                      <Pencil className="h-3 w-3 text-slate-400" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); }}>
                      <Trash2 className="h-3 w-3 text-red-400" />
                    </Button>
                    <button type="button" onClick={() => toggle(c.id)}>
                      {isOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t bg-slate-50 px-4 py-4 space-y-5">

                    {/* Outbound Pipelines */}
                    {pipelines.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Outbound Pipelines</p>
                        {pipelines.map(job => (
                          <div key={job.id} className="flex items-center justify-between bg-white border rounded-md px-3 py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Zap className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                              <span className="text-xs font-medium text-slate-700 truncate">{job.job_name}</span>
                              <span className="text-xs text-slate-400 shrink-0">{job.object_type}</span>
                            </div>
                            <div className="flex items-center gap-2 ml-3 shrink-0">
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${job.last_run_status === "Success" ? "bg-emerald-100 text-emerald-700" : job.last_run_status === "Failed" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"}`}>
                                {job.last_run_status || "Never Run"}
                              </span>
                              <span className={`text-xs px-1.5 py-0.5 rounded ${job.is_enabled ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-400"}`}>
                                {job.is_enabled ? "Active" : "Disabled"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Target List Products */}
                    <div className="bg-white border rounded-lg p-3">
                      <ProductsManager campaign={c} />
                    </div>



                    {/* Conversion Inbound Key */}
                    <div className="bg-white border rounded-lg p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Key className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-xs font-semibold text-slate-700">Conversion Inbound Push</span>
                        </div>
                        {c.inbound_conversion_api_key && (
                          <Button variant="outline" size="sm" className="h-6 text-xs gap-1 px-2" onClick={() => copyConvInstructions(c)}>
                            {convFieldsCopied === c.id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                            {convFieldsCopied === c.id ? "Copied!" : "Copy Instructions"}
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">One shared conversion endpoint per campaign. Authenticate with this campaign-level API key.</p>

                      {/* API Key */}
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-slate-500">API Key</p>
                        {c.inbound_conversion_api_key ? (
                          <div className="flex gap-1.5 items-center">
                            <code className="text-xs bg-slate-50 border rounded px-2 py-1 flex-1 truncate font-mono">
                              {convKeyVisible[c.id] ? c.inbound_conversion_api_key : c.inbound_conversion_api_key.slice(0, 7) + "•".repeat(16)}
                            </code>
                            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setConvKeyVisible(s => ({ ...s, [c.id]: !s[c.id] }))}>
                              {convKeyVisible[c.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </Button>
                            {convKeyVisible[c.id] && (
                              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => copyConvKey(c.inbound_conversion_api_key, c.id)}>
                                {convKeyCopied === c.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                              </Button>
                            )}
                            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleGenerateConvKey(c)} disabled={generatingConvKey === c.id} title="Regenerate">
                              <RefreshCw className={`h-3.5 w-3.5 ${generatingConvKey === c.id ? "animate-spin" : ""}`} />
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={() => handleGenerateConvKey(c)} disabled={generatingConvKey === c.id}>
                            {generatingConvKey === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                            Generate Conversion API Key
                          </Button>
                        )}
                      </div>

                      {/* Field Schema */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-slate-500">Required Fields</p>
                          <Button variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={() => addConvField(c.id)} type="button">
                            <Plus className="h-3 w-3" /> Add Field
                          </Button>
                        </div>
                        {getConvFieldsById(c.id).length === 0 && (
                          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 rounded-lg p-3 border border-dashed border-slate-200">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            No fields defined — all incoming fields will be accepted.
                          </div>
                        )}
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {getConvFieldsById(c.id).map((field, idx) => (
                            <div key={idx} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
                              <GripVertical className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                              <input
                                placeholder="field_name"
                                value={field.name}
                                onChange={e => updateConvField(c.id, idx, "name", e.target.value.replace(/\s+/g, "_").toLowerCase())}
                                className="font-mono text-xs h-7 flex-1 border border-input rounded-md px-2 bg-white focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                              <Select value={field.type} onValueChange={val => updateConvField(c.id, idx, "type", val)}>
                                <SelectTrigger className="h-7 text-xs w-24 shrink-0"><SelectValue /></SelectTrigger>
                                <SelectContent>{FIELD_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
                              </Select>
                              <button
                                type="button"
                                onClick={() => updateConvField(c.id, idx, "required", !field.required)}
                                className={`text-xs px-2 py-1 rounded border font-medium transition-colors shrink-0 ${field.required ? "bg-red-50 text-red-600 border-red-200" : "bg-slate-100 text-slate-400 border-slate-200"}`}
                              >
                                {field.required ? "Req" : "Opt"}
                              </button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-slate-400 hover:text-red-500" onClick={() => removeConvField(c.id, idx)} type="button">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        {convFields[c.id] !== undefined && (
                          <Button size="sm" className="h-7 text-xs gap-1" onClick={() => saveConvFields(c)} disabled={savingConvFields === c.id}>
                            {savingConvFields === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                            Save Fields
                          </Button>
                        )}
                      </div>
                    </div>

                    {c.notes && <p className="text-xs text-slate-400">{c.notes}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Campaign" : "New Campaign"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-500">Campaign Name *</Label>
              <Input value={form.campaign_name} onChange={e => setForm(f => ({ ...f, campaign_name: e.target.value }))} placeholder="e.g. Q3 Lead Gen" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-500">Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-500">Start Date</Label>
                <Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-500">End Date</Label>
                <Input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-500">Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes…" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.campaign_name.trim()}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              {editing ? "Save Changes" : "Create Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.campaign_name}</strong>? This cannot be undone.
            </AlertDialogDescription>
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