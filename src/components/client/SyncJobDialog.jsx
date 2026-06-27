import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Loader2, ChevronDown, ChevronUp, RefreshCw, Eye } from "lucide-react";
import FieldMappingSection from "@/components/client/FieldMappingSection";
import { Textarea } from "@/components/ui/textarea";
import ApiDataPreview from "@/components/client/ApiDataPreview";
import FieldSelectPreview from "@/components/client/FieldSelectPreview";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { format } from "date-fns";

// Predefined field options per object type
const FIELD_OPTIONS = {
  Leads:       ["first_name","last_name","email","phone","company","lead_source","status","created_date","owner"],
  Contacts:    ["first_name","last_name","email","phone","company","job_title","created_date","owner"],
  Deals:       ["deal_name","stage","amount","currency","close_date","owner","contact","company"],
  Companies:   ["company_name","domain","industry","employee_count","annual_revenue","country"],
  Conversions: ["contact_id","deal_id","conversion_date","revenue","source","campaign"],
  Orders:      [], // populated dynamically from live WooCommerce schema
  Custom:      [],
};

const OBJECT_TYPES = ["Leads","Contacts","Deals","Companies","Conversions","Orders","Custom"];
const WOO_OBJECT_TYPES_FALLBACK = [{ label: "Orders", path: "orders" }];

const TIME_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const hour = i % 12 === 0 ? 12 : i % 12;
  const ampm = i < 12 ? "AM" : "PM";
  return { label: `${hour}:00 ${ampm}`, value: `${String(i).padStart(2,"0")}:00` };
});

const DAY_OPTIONS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];


const DEFAULTS = {
  job_name: "",
  job_type: "Target",
  object_type: "Leads",
  custom_object_name: "",
  selected_fields: [],
  field_mappings: [],
  sharepoint_filename: "",
  frequency_type: "daily",
  interval_value: 1,
  interval_unit: "days",
  scheduled_time: "09:00",
  scheduled_day: "1",
  scheduled_dates: [],
  is_enabled: true,
  date_filter_type: "none",
  date_filter_field: "",
  date_filter_relative_days: 30,
  date_filter_start: "",
  date_filter_end: "",
  api_endpoint: "",
  api_method: "GET",
  api_auth_type: "Bearer Token",
  api_auth_value: "",
  api_auth_header_name: "",
  api_request_body: "",
  api_notes: "",
};

export default function SyncJobDialog({ open, onClose, onSaved, client, job }) {
  const [form, setForm] = useState(DEFAULTS);

  const [saving, setSaving] = useState(false);
  const [apiOpen, setApiOpen] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [liveFields, setLiveFields] = useState([]);
  const [liveExpandedFields, setLiveExpandedFields] = useState(new Set());
  const [liveArraySources, setLiveArraySources] = useState([]);
  const [fetchingSchema, setFetchingSchema] = useState(false);
  const [fieldSearch, setFieldSearch] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [fieldSelectPreviewOpen, setFieldSelectPreviewOpen] = useState(false);
  const [wooObjects, setWooObjects] = useState([]);
  const [fetchingObjects, setFetchingObjects] = useState(false);

  const isWooClient = client?.crm_type === "WooCommerce";

  const handleFetchLiveFields = async () => {
    setFetchingSchema(true);
    try {
      // object_type is now the raw WooCommerce path (e.g. "orders", "products/categories")
      const wooPage = form.object_type;
      const res = await base44.functions.invoke("fetchWooCommerceSchema", { client_id: client.id, woo_page: wooPage });
      const fields = res.data?.fields || [];
      if (fields.length === 0) {
        toast.warning(res.data?.message || "No fields returned from live API");
      } else {
        setLiveFields(fields);
        setLiveExpandedFields(new Set(res.data?.expanded_fields || []));
        setLiveArraySources(res.data?.array_source_fields || []);
        toast.success(`Fetched ${fields.length} fields from live WooCommerce ${form.object_type} API`);
      }
    } catch (err) {
      toast.error(`Failed to fetch schema: ${err.message}`);
    }
    setFetchingSchema(false);
  };

  useEffect(() => {
    if (!open) return; // only initialize when dialog opens
    if (job) {
      setForm({ ...DEFAULTS, ...job });
    } else {
      // Pre-fill API config from client credentials for new jobs
      const authTypeMap = {
        "API Key": "API Key Header",
        "OAuth2": "Bearer Token",
        "Webhook Only": "None",
      };
      setForm({
        ...DEFAULTS,
        object_type: client?.crm_type === "WooCommerce" ? "Orders" : "Leads",
        api_endpoint: client?.api_base_url || "",
        api_auth_type: authTypeMap[client?.auth_type] || "Bearer Token",
        api_auth_value: client?.auth_type === "API Key" ? (client?.api_key || "") : (client?.access_token || ""),
      });
      // Auto-open API section if client has credentials to show
      setApiOpen(!!(client?.api_base_url || client?.api_key || client?.access_token));
    }
    setLiveFields([]);
    setLiveExpandedFields(new Set());
    setLiveArraySources([]);
    setFieldSearch("");
    setWooObjects([]);

    // For WooCommerce clients, dynamically discover accessible objects
    if (client?.crm_type === "WooCommerce") {
      setFetchingObjects(true);
      base44.functions.invoke("fetchWooCommerceObjects", { client_id: client.id })
        .then(res => {
          const objs = res.data?.objects || [];
          setWooObjects(objs.length > 0 ? objs : WOO_OBJECT_TYPES_FALLBACK);
        })
        .catch(() => setWooObjects(WOO_OBJECT_TYPES_FALLBACK))
        .finally(() => setFetchingObjects(false));
    }
  }, [job, open]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  // For WooCommerce, use live-fetched fields if available, otherwise fall back to static list
  const availableFields = (isWooClient && liveFields.length > 0)
    ? liveFields
    : (FIELD_OPTIONS[form.object_type] || []);

  const addField = (field) => {
    if (!field || form.selected_fields.includes(field)) return;
    setForm(f => ({
      ...f,
      selected_fields: [...f.selected_fields, field],
      field_mappings: f.field_mappings.some(m => m.source === field)
        ? f.field_mappings
        : [...f.field_mappings, { source: field, destination: "" }],
    }));
  };

  const removeField = (field) => {
    setForm(f => ({
      ...f,
      selected_fields: f.selected_fields.filter(x => x !== field),
      field_mappings: f.field_mappings.filter(m => m.source !== field),
    }));
  };

  const updateMapping = (source, destination) => {
    setForm(f => ({
      ...f,
      field_mappings: f.field_mappings.map(m => m.source === source ? { ...m, destination } : m),
    }));
  };

  const handleSave = async () => {
    if (!form.job_name.trim()) { toast.error("Pipeline name is required"); return; }
    setSaving(true);
    const payload = {
      client_id: client.id,
      job_name: form.job_name,
      job_type: form.job_type,
      object_type: form.object_type,
      custom_object_name: form.custom_object_name,
      selected_fields: form.selected_fields,
      field_mappings: form.field_mappings || [],
      campaign_name: client?.campaign_name || "",
      sharepoint_filename: (() => {
        const typePrefix = form.job_type === "Target" ? "T" : form.job_type === "Suppression" ? "S" : "C";
        const clientName = (client?.client_name || "Client").replace(/\s+/g, "_");
        const today = format(new Date(), "yyyyMMdd");
        return `${typePrefix}_X_${clientName}_${today}`;
      })(),
      frequency_type: form.frequency_type,
      interval_value: Number(form.interval_value),
      interval_unit: form.interval_unit,
      scheduled_time: form.scheduled_time,
      scheduled_day: form.scheduled_day,
      is_enabled: form.is_enabled,
      scheduled_dates: form.scheduled_dates || [],
      api_endpoint: form.api_endpoint,
      api_method: form.api_method,
      api_auth_type: form.api_auth_type,
      api_auth_value: form.api_auth_value,
      api_auth_header_name: form.api_auth_header_name,
      api_request_body: form.api_request_body,
      api_notes: form.api_notes,
      date_filter_type: form.date_filter_type,
      date_filter_field: form.date_filter_field,
      date_filter_relative_days: form.date_filter_type === "relative" ? Number(form.date_filter_relative_days) : null,
      date_filter_start: form.date_filter_type === "absolute" ? form.date_filter_start : "",
      date_filter_end: form.date_filter_type === "absolute" ? form.date_filter_end : "",
    };
    if (job) {
      await base44.entities.SyncJobs.update(job.id, payload);
      toast.success("Sync job updated");
    } else {
      await base44.entities.SyncJobs.create({ ...payload, last_run_status: "Never Run" });
      toast.success("Sync job created");
    }
    setSaving(false);
    onSaved();
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen && !fieldSelectPreviewOpen) onClose(); }} modal={!fieldSelectPreviewOpen}>
      <DialogContent
        className="max-w-lg max-h-[90vh] overflow-y-auto"
        onInteractOutside={e => { if (fieldSelectPreviewOpen) e.preventDefault(); }}
        onEscapeKeyDown={e => { if (fieldSelectPreviewOpen) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle>{job ? "Edit Data Pipeline" : "Add Data Pipeline"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Pipeline Name */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-500">Pipeline Name</Label>
            <Input placeholder="e.g. Daily Leads Pull" value={form.job_name} onChange={e => set("job_name", e.target.value)} />
          </div>

          {/* Pipeline Type */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-500">Pipeline Type</Label>
            <Select value={form.job_type} onValueChange={v => set("job_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Target">Target</SelectItem>
                <SelectItem value="Conversion">Conversion</SelectItem>
                <SelectItem value="Suppression">Suppression</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Object Type */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-500">CRM Object</Label>
            {isWooClient ? (
              <div className="space-y-1">
                <Select
                  value={form.object_type}
                  onValueChange={v => { set("object_type", v); set("selected_fields", []); setLiveFields([]); }}
                  disabled={fetchingObjects}
                >
                  <SelectTrigger>
                    {fetchingObjects
                      ? <span className="flex items-center gap-2 text-slate-400"><Loader2 className="h-3 w-3 animate-spin" />Discovering objects…</span>
                      : <SelectValue placeholder="Select an object…" />
                    }
                  </SelectTrigger>
                  <SelectContent>
                    {wooObjects.map(o => (
                      <SelectItem key={o.path} value={o.path}>{o.label}</SelectItem>
                    ))}
                    <SelectItem value="Custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
                {wooObjects.length > 0 && !fetchingObjects && (
                  <p className="text-xs text-emerald-600">{wooObjects.length} accessible object{wooObjects.length !== 1 ? "s" : ""} found on this client's API</p>
                )}
              </div>
            ) : (
              <Select value={form.object_type} onValueChange={v => { set("object_type", v); set("selected_fields", []); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OBJECT_TYPES.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          {form.object_type === "Custom" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-500">Custom Object Name</Label>
              <Input placeholder="e.g. marketing_leads" value={form.custom_object_name} onChange={e => set("custom_object_name", e.target.value)} />
            </div>
          )}

          {/* Fields */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-slate-500">Fields to Pull</Label>
              {isWooClient && (
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    onClick={handleFetchLiveFields}
                    disabled={fetchingSchema}
                  >
                    {fetchingSchema
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <RefreshCw className="h-3 w-3" />}
                    {fetchingSchema ? "Fetching…" : liveFields.length > 0 ? "Re-fetch" : "Fetch Live Fields"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5 border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                    onClick={() => setFieldSelectPreviewOpen(true)}
                  >
                    <Eye className="h-3 w-3" />
                    Browse &amp; Select
                  </Button>
                </div>
              )}
            </div>
            {liveFields.length > 0 && (
              <p className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                {liveFields.length} fields loaded from live WooCommerce API — click to select
                {liveArraySources.length > 0 && (
                  <span className="block mt-0.5 text-emerald-500">
                    Array fields expanded: <span className="italic">{liveArraySources.join(", ")}</span>
                  </span>
                )}
              </p>
            )}

            {/* Field search */}
            {availableFields.length > 0 && (
              <Input
                placeholder="Search fields…"
                value={fieldSearch}
                onChange={e => setFieldSearch(e.target.value)}
                className="text-sm h-8"
              />
            )}

            {/* Predefined field buttons */}
            {availableFields.length > 0 && (
              <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
                {availableFields.map(f => {
                  const isSelected = form.selected_fields.includes(f);
                  const isExpanded = liveExpandedFields.has(f);
                  const searchTerm = fieldSearch.trim().toLowerCase();
                  const isMatch = searchTerm.length > 0 && f.toLowerCase().includes(searchTerm);
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => isSelected ? removeField(f) : addField(f)}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${
                        isSelected
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : isMatch
                          ? "bg-yellow-200 text-slate-800 border-yellow-400 hover:border-yellow-500"
                          : "bg-white text-slate-600 border-slate-300 hover:border-indigo-400"
                      } ${isExpanded ? "italic" : ""}`}
                    >
                      {f}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Selected fields chips */}
            {form.selected_fields.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {form.selected_fields.map(f => (
                  <Badge key={f} variant="secondary" className="flex items-center gap-1 text-xs pr-1">
                    {f}
                    <button type="button" onClick={() => removeField(f)} className="hover:text-red-500 ml-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Date Filter Section */}
          <div className="border rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b">
              <Label className="text-xs font-medium text-slate-700">Date Filter</Label>
              <p className="text-xs text-slate-400 mt-0.5">Limit the data pulled to a specific time range</p>
            </div>
            <div className="p-4 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Filter Type</Label>
                <Select value={form.date_filter_type} onValueChange={v => set("date_filter_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No date filter</SelectItem>
                    <SelectItem value="relative">Relative — last N days</SelectItem>
                    <SelectItem value="absolute">Absolute — fixed date range</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.date_filter_type !== "none" && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Date Field to Filter On</Label>
                  {isWooClient && liveFields.length > 0 ? (
                    <>
                      <Select value={form.date_filter_field || ""} onValueChange={v => set("date_filter_field", v)}>
                        <SelectTrigger className="font-mono text-xs">
                          <SelectValue placeholder="Select a date field…" />
                        </SelectTrigger>
                        <SelectContent>
                          {liveFields
                            .filter(f => /date|time|_at$|created|modified|updated|completed|paid/i.test(f))
                            .map(f => <SelectItem key={f} value={f} className="font-mono text-xs">{f}</SelectItem>)
                          }
                          {liveFields
                            .filter(f => !/date|time|_at$|created|modified|updated|completed|paid/i.test(f))
                            .map(f => <SelectItem key={f} value={f} className="font-mono text-xs text-slate-400">{f}</SelectItem>)
                          }
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-slate-400">
                        For WooCommerce, filtering uses the <code className="bg-slate-100 px-1 rounded">after</code> / <code className="bg-slate-100 px-1 rounded">before</code> query params — the selected field is used as a reference label. Dates must be ISO 8601 (e.g. <code className="bg-slate-100 px-1 rounded">2024-01-15</code>).
                      </p>
                    </>
                  ) : (
                    <>
                      <Input
                        placeholder="e.g. date_created, date_modified"
                        value={form.date_filter_field}
                        onChange={e => set("date_filter_field", e.target.value)}
                        className="text-sm font-mono"
                      />
                      <p className="text-xs text-slate-400">The API field name used for date filtering. Fetch live fields above to pick from a list.</p>
                    </>
                  )}
                </div>
              )}

              {form.date_filter_type === "relative" && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Pull data from the last</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={form.date_filter_relative_days}
                      onChange={e => set("date_filter_relative_days", e.target.value)}
                      className="w-24"
                    />
                    <span className="text-sm text-slate-500">days</span>
                  </div>
                  <p className="text-xs text-slate-400">Each run will pull records from the last {form.date_filter_relative_days || "N"} days relative to the run date</p>
                </div>
              )}

              {form.date_filter_type === "absolute" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-500">Start Date</Label>
                    <Input
                      type="date"
                      value={form.date_filter_start}
                      onChange={e => set("date_filter_start", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-500">End Date</Label>
                    <Input
                      type="date"
                      value={form.date_filter_end}
                      onChange={e => set("date_filter_end", e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Schedule */}
          <div className="space-y-3">
            <Label className="text-xs font-medium text-slate-500">Schedule</Label>
            <Select value={form.frequency_type} onValueChange={v => set("frequency_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="interval">Every N hours/minutes</SelectItem>
                <SelectItem value="custom_days">Every N days</SelectItem>
                <SelectItem value="monthly">Monthly (pick dates)</SelectItem>
                <SelectItem value="manual">Manual only</SelectItem>
              </SelectContent>
            </Select>

            {/* Daily / Weekly — pick time */}
            {["daily","weekly"].includes(form.frequency_type) && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Time of Day</Label>
                  <Select value={form.scheduled_time} onValueChange={v => set("scheduled_time", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIME_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {form.frequency_type === "weekly" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-500">Day of Week</Label>
                    <Select value={form.scheduled_day} onValueChange={v => set("scheduled_day", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DAY_OPTIONS.map((d,i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {/* Interval */}
            {form.frequency_type === "interval" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Every</Label>
                  <Input type="number" min={1} value={form.interval_value} onChange={e => set("interval_value", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Unit</Label>
                  <Select value={form.interval_unit} onValueChange={v => set("interval_unit", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">Minutes</SelectItem>
                      <SelectItem value="hours">Hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Custom days (e.g. every 60 days) */}
            {form.frequency_type === "custom_days" && (
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Every N Days</Label>
                <Input type="number" min={1} value={form.interval_value} onChange={e => set("interval_value", e.target.value)} placeholder="e.g. 60" />
              </div>
            )}

            {/* Monthly — calendar date picker */}
            {form.frequency_type === "monthly" && (
              <div className="space-y-2">
                <Label className="text-xs text-slate-500">Select pull dates (pick one or more dates on the calendar)</Label>
                <div className="border rounded-lg overflow-hidden flex justify-center bg-white">
                  <Calendar
                    mode="multiple"
                    selected={(form.scheduled_dates || []).map(d => new Date(d + "T12:00:00"))}
                    onSelect={(dates) => set("scheduled_dates", (dates || []).map(d => format(d, "yyyy-MM-dd")))}
                    className="p-2"
                  />
                </div>
                {form.scheduled_dates?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {form.scheduled_dates.map(d => (
                      <Badge key={d} variant="secondary" className="flex items-center gap-1 text-xs pr-1">
                        {format(new Date(d + "T12:00:00"), "MMM d, yyyy")}
                        <button type="button" onClick={() => set("scheduled_dates", form.scheduled_dates.filter(x => x !== d))} className="hover:text-red-500 ml-0.5">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Manual — informational note */}
            {form.frequency_type === "manual" && (
              <p className="text-xs text-slate-500 bg-slate-50 border rounded-lg p-3">
                This job will not run automatically. Use the <strong>Run Now</strong> button on the job list to trigger it manually whenever needed.
              </p>
            )}
          </div>
          {/* Field Mapping Section */}
          {form.selected_fields.length > 0 && (
            <FieldMappingSection
              fieldMappings={form.field_mappings}
              objectType={form.object_type}
              open={mappingOpen}
              onToggle={() => setMappingOpen(v => !v)}
              onUpdate={updateMapping}
            />
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-500">SharePoint CSV Filename</Label>
            {(() => {
              const typePrefix = form.job_type === "Target" ? "T" : form.job_type === "Suppression" ? "S" : "C";
              const clientName = (client?.client_name || "Client").replace(/\s+/g, "_");
              const today = format(new Date(), "yyyyMMdd");
              const autoName = `${typePrefix}_X_${clientName}_${today}`;
              return (
                <div className="flex items-center gap-0">
                  <div className="flex-1 flex items-center h-9 px-3 rounded-l-md border bg-slate-50 font-mono text-xs text-slate-700 truncate">
                    {autoName}
                  </div>
                  <span className="inline-flex items-center px-3 h-9 border border-l-0 rounded-r-md bg-slate-100 text-slate-500 text-xs font-mono">.csv</span>
                </div>
              );
            })()}
            <p className="text-xs text-slate-400">Filename is auto-generated from the pipeline type, client name, and date.</p>
          </div>


          {/* API Config Section */}
          <div className="border rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setApiOpen(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-sm font-medium text-slate-700"
            >
              <span>API Configuration</span>
              {apiOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
            </button>

            {apiOpen && (
              <div className="p-4 space-y-4 border-t">
                {/* Endpoint + Method */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-500">Endpoint URL</Label>
                  <div className="flex gap-2">
                    <Select value={form.api_method} onValueChange={v => set("api_method", v)}>
                      <SelectTrigger className="w-24 shrink-0"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GET">GET</SelectItem>
                        <SelectItem value="POST">POST</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input placeholder="https://api.example.com/v1/leads" value={form.api_endpoint} onChange={e => set("api_endpoint", e.target.value)} />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1.5 text-xs border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                      disabled={!form.api_endpoint}
                      onClick={() => setPreviewOpen(true)}
                      title="Preview live data from this endpoint"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Preview
                    </Button>
                  </div>
                </div>

                {/* Auth */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-500">Authentication</Label>
                  <Select value={form.api_auth_type} onValueChange={v => set("api_auth_type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="None">None</SelectItem>
                      <SelectItem value="Bearer Token">Bearer Token</SelectItem>
                      <SelectItem value="API Key Header">API Key Header</SelectItem>
                      <SelectItem value="Basic Auth">Basic Auth</SelectItem>
                    </SelectContent>
                  </Select>

                  {form.api_auth_type === "API Key Header" && (
                    <Input placeholder="Header name (e.g. X-API-Key)" value={form.api_auth_header_name} onChange={e => set("api_auth_header_name", e.target.value)} className="mt-2" />
                  )}

                  {form.api_auth_type !== "None" && (
                    <Input
                      placeholder={form.api_auth_type === "Basic Auth" ? "base64(user:pass)" : "Token / Key value"}
                      value={form.api_auth_value}
                      onChange={e => set("api_auth_value", e.target.value)}
                      className="mt-2 font-mono text-xs"
                      type="password"
                    />
                  )}
                </div>

                {/* Request Body (POST only) */}
                {form.api_method === "POST" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-500">Request Body (JSON)</Label>
                    <Textarea
                      placeholder={'{\n  "limit": 100,\n  "offset": 0\n}'}
                      value={form.api_request_body}
                      onChange={e => set("api_request_body", e.target.value)}
                      className="font-mono text-xs h-28"
                    />
                  </div>
                )}

                {/* Notes */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-500">Notes for Data Team</Label>
                  <Textarea
                    placeholder="Document any quirks, pagination logic, rate limits, or field mapping notes…"
                    value={form.api_notes}
                    onChange={e => set("api_notes", e.target.value)}
                    className="text-sm h-20"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {job ? "Update Pipeline" : "Create Pipeline"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <ApiDataPreview
      open={previewOpen}
      onClose={() => setPreviewOpen(false)}
      config={form}
      client={client}
      filteredColumns={form.selected_fields.length > 0 ? form.selected_fields : undefined}
      fieldMappings={form.field_mappings}
    />

    <FieldSelectPreview
      open={fieldSelectPreviewOpen}
      onClose={() => setFieldSelectPreviewOpen(false)}
      onConfirm={(fields) => {
        const newMappings = fields.map(f => {
          const existing = form.field_mappings.find(m => m.source === f);
          return existing || { source: f, destination: "" };
        });
        setForm(frm => ({ ...frm, selected_fields: fields, field_mappings: newMappings }));
        if (liveFields.length === 0) setLiveFields(fields);
        setFieldSelectPreviewOpen(false);
      }}
      client={client}
      objectType={form.object_type}
      initialSelected={form.selected_fields}
      dateFilter={{
        date_filter_type: form.date_filter_type,
        date_filter_field: form.date_filter_field,
        date_filter_relative_days: form.date_filter_relative_days,
        date_filter_start: form.date_filter_start,
        date_filter_end: form.date_filter_end,
      }}
    />
    </>
  );
}