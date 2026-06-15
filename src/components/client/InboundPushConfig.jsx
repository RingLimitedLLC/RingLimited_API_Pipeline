import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Copy, RefreshCw, Check, Webhook, Eye, EyeOff, Mail,
  Plus, Trash2, GripVertical, AlertCircle
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const FIELD_TYPES = ["string", "email", "phone", "number", "date", "boolean"];
const ENDPOINT_URL = "https://pipeline.ring.digital/api/apps/67b8f9ccbc57b4f9994fb5c3/functions/inboundPush";

const LIST_TYPES = [
  {
    key: "suppression",
    label: "Suppression List",
    color: "bg-amber-100 text-amber-700 border-amber-200",
    activeColor: "border-amber-500 text-amber-700 bg-amber-50",
    badge: "bg-amber-100 text-amber-700",
    description: "Records to exclude from outreach — existing customers, opt-outs, DNC.",
    apiKeyField: "inbound_suppression_api_key",
    schemaField: "inbound_suppression_field_schema",
    defaultFields: [
      { name: "email", type: "email", required: false },
      { name: "phone", type: "phone", required: false },
      { name: "address", type: "string", required: false },
    ],
  },
  {
    key: "conversion",
    label: "Conversion List",
    color: "bg-emerald-100 text-emerald-700 border-emerald-200",
    activeColor: "border-emerald-500 text-emerald-700 bg-emerald-50",
    badge: "bg-emerald-100 text-emerald-700",
    description: "Records that converted — used for attribution and reporting.",
    apiKeyField: "inbound_conversion_api_key",
    schemaField: "inbound_conversion_field_schema",
    defaultFields: [
      { name: "lead_id", type: "string", required: true },
      { name: "conversion_date", type: "date", required: true },
      { name: "revenue", type: "number", required: false },
      { name: "source", type: "string", required: false },
    ],
  },
];

function generateApiKey() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "rpk_";
  for (let i = 0; i < 40; i++) key += chars[Math.floor(Math.random() * chars.length)];
  return key;
}

function exampleValueForType(type) {
  switch (type) {
    case "email": return "jane@example.com";
    case "phone": return "555-0100";
    case "number": return 42;
    case "date": return "2025-01-15";
    case "boolean": return true;
    default: return "value";
  }
}

function EndpointPanel({ client, listType, onUpdate }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(null);
  const [fields, setFields] = useState([]);
  const [savingFields, setSavingFields] = useState(false);
  const [fieldsDirty, setFieldsDirty] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [campaignType, setCampaignType] = useState("");

  const { data: campaigns = [] } = useQuery({
    queryKey: ["campaigns", client.id],
    queryFn: () => base44.entities.Campaigns.filter({ client_id: client.id }, "campaign_name"),
  });

  const apiKey = client[listType.apiKeyField];
  const hasKey = !!apiKey;
  const displayKey = hasKey
    ? (showKey ? apiKey : apiKey.slice(0, 7) + "•".repeat(20))
    : null;

  useEffect(() => {
    try {
      const saved = client[listType.schemaField] ? JSON.parse(client[listType.schemaField]) : [];
      setFields(saved.length ? saved : listType.defaultFields);
    } catch {
      setFields(listType.defaultFields);
    }
    setFieldsDirty(false);
  }, [client.id, listType.key]);

  const copyToClipboard = async (text, label) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2500);
    toast({ title: "Copied!", description: `${label} copied to clipboard.` });
  };

  const handleGenerateKey = async () => {
    const newKey = generateApiKey();
    setSaving(true);
    await base44.entities.Clients.update(client.id, { [listType.apiKeyField]: newKey });
    setSaving(false);
    onUpdate();
    toast({ title: "API key generated", description: `New key created for ${listType.label}.` });
  };

  const handleSaveFields = async () => {
    setSavingFields(true);
    await base44.entities.Clients.update(client.id, { [listType.schemaField]: JSON.stringify(fields) });
    setSavingFields(false);
    setFieldsDirty(false);
    onUpdate();
    toast({ title: "Fields saved" });
  };

  const addField = () => {
    setFields(prev => [...prev, { name: "", type: "string", required: false }]);
    setFieldsDirty(true);
  };
  const removeField = (idx) => {
    setFields(prev => prev.filter((_, i) => i !== idx));
    setFieldsDirty(true);
  };
  const updateField = (idx, key, value) => {
    setFields(prev => prev.map((f, i) => i === idx ? { ...f, [key]: value } : f));
    setFieldsDirty(true);
  };

  const exampleRecord = fields.reduce((acc, f) => {
    if (f.name) acc[f.name] = exampleValueForType(f.type);
    return acc;
  }, {});

  const campaignNameForExample = selectedCampaign || "Q1_Campaign";
  const today = new Date().toISOString().slice(0, 10);
  const clientNameSlug = client.client_name.replace(/\s+/g, "_");
  const generatedFilename = `T_X_${clientNameSlug}_${today}${campaignType ? `_${campaignType.replace(/\s+/g, "_")}` : ""}`;

  const examplePayload = JSON.stringify({
    client_id: client.id,
    list_type: listType.key,
    campaign_name: campaignNameForExample,
    filename: generatedFilename,
    records: [exampleRecord]
  }, null, 2);

  const handleCopyInstructions = () => {
    if (!hasKey) return;
    const fieldDocs = fields.filter(f => f.name).map(f =>
      `    "${f.name}": <${f.type}>${f.required ? " (required)" : " (optional)"}`
    ).join(",\n");

    const campaignLine = selectedCampaign
      ? `"campaign_name": "${selectedCampaign}",`
      : `"campaign_name": "<campaign folder name>",`;

    const instructions = `
=== Ring Data Ops — Inbound Push API ===
Client: ${client.client_name}
List Type: ${listType.label}${selectedCampaign ? `\nCampaign: ${selectedCampaign}` : ""}${campaignType ? `\nCampaign Type: ${campaignType}` : ""}

ENDPOINT
  POST ${ENDPOINT_URL}

AUTHENTICATION
  Authorization: Bearer ${apiKey}

REQUEST BODY (JSON)
  {
    "client_id":     "${client.id}",
    "list_type":     "${listType.key}",
    ${campaignLine}
    "filename":      "${generatedFilename}",
    "records": [
      {
${fieldDocs}
      }
    ]
  }

FILES DELIVERED TO
SharePoint → Ring Digital/Current Clients/${client.client_name}/${selectedCampaign || "<campaign_name>"}/Data/Original/${generatedFilename}.csv
`.trim();
    copyToClipboard(instructions, "Instructions");
  };

  return (
    <div className="space-y-5 pt-4">
      <p className="text-xs text-slate-500">{listType.description}</p>

      {/* Campaign Selector */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-slate-500">Campaign</Label>
        <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
          <SelectTrigger className="text-xs">
            <SelectValue placeholder="Select a campaign (optional)" />
          </SelectTrigger>
          <SelectContent>
            {campaigns.map(c => (
              <SelectItem key={c.id} value={c.campaign_name} className="text-xs">{c.campaign_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-slate-400">Selecting a campaign pre-fills it in the example payload and client instructions.</p>
      </div>

      {/* Campaign Type */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-slate-500">Campaign Type</Label>
        <Input
          placeholder="e.g. Postcard, Email, DirectMail"
          value={campaignType}
          onChange={e => setCampaignType(e.target.value)}
          className="text-xs"
        />
      </div>

      {/* Generated Filename Preview */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-1">
        <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Generated Filename</p>
        <div className="flex items-center gap-2">
          <code className="text-sm font-mono font-bold text-indigo-900 break-all flex-1">
            {generatedFilename}.csv
          </code>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-100" onClick={() => copyToClipboard(generatedFilename, "Filename")}>
            {copied === "Filename" ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
        <p className="text-xs text-indigo-500">Pattern: <span className="font-mono">T_X_ClientName_YYYY-MM-DD_CampaignType</span></p>
      </div>

      {/* Endpoint URL */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-slate-500">Endpoint URL</Label>
        <div className="flex gap-2">
          <Input readOnly value={ENDPOINT_URL} className="font-mono text-xs bg-slate-50 text-slate-600" />
          <Button variant="outline" size="icon" className="shrink-0" onClick={() => copyToClipboard(ENDPOINT_URL, "Endpoint")}>
            {copied === "Endpoint" ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Client ID */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-slate-500">Client ID</Label>
        <div className="flex gap-2">
          <Input readOnly value={client.id} className="font-mono text-xs bg-slate-50 text-slate-600" />
          <Button variant="outline" size="icon" className="shrink-0" onClick={() => copyToClipboard(client.id, "Client ID")}>
            {copied === "Client ID" ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* API Key */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-slate-500">API Key</Label>
        {hasKey ? (
          <div className="flex gap-2">
            <Input readOnly value={displayKey} className="font-mono text-xs bg-slate-50 text-slate-600" />
            <Button variant="outline" size="icon" className="shrink-0" onClick={() => setShowKey(v => !v)}>
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            {showKey && (
              <Button variant="outline" size="icon" className="shrink-0" onClick={() => copyToClipboard(apiKey, "API Key")}>
                {copied === "API Key" ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            )}
            <Button variant="outline" size="icon" className="shrink-0" onClick={handleGenerateKey} disabled={saving} title="Regenerate key">
              <RefreshCw className={`h-4 w-4 ${saving ? "animate-spin" : ""}`} />
            </Button>
          </div>
        ) : (
          <Button onClick={handleGenerateKey} disabled={saving} size="sm" className="gap-2">
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Generate API Key
          </Button>
        )}
        <p className="text-xs text-slate-400">
          Send as: <code className="bg-slate-100 px-1 rounded">Authorization: Bearer &lt;key&gt;</code>
        </p>
      </div>

      {/* Field Schema */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium text-slate-700">Required Fields</Label>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={addField}>
            <Plus className="h-3.5 w-3.5" /> Add Field
          </Button>
        </div>

        {fields.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 rounded-lg p-3 border border-dashed border-slate-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            No fields defined yet.
          </div>
        )}

        <div className="space-y-2">
          {fields.map((field, idx) => (
            <div key={idx} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
              <GripVertical className="h-4 w-4 text-slate-300 shrink-0" />
              <Input
                placeholder="field_name"
                value={field.name}
                onChange={e => updateField(idx, "name", e.target.value.replace(/\s+/g, "_").toLowerCase())}
                className="font-mono text-xs h-7 flex-1"
              />
              <Select value={field.type} onValueChange={val => updateField(idx, "type", val)}>
                <SelectTrigger className="h-7 text-xs w-28 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <button
                onClick={() => updateField(idx, "required", !field.required)}
                className={`text-xs px-2 py-1 rounded border font-medium transition-colors shrink-0 ${
                  field.required
                    ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                    : "bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200"
                }`}
              >
                {field.required ? "Required" : "Optional"}
              </button>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-slate-400 hover:text-red-500" onClick={() => removeField(idx)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        {fieldsDirty && (
          <Button size="sm" className="gap-2 text-xs" onClick={handleSaveFields} disabled={savingFields}>
            {savingFields ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Save Fields
          </Button>
        )}
      </div>

      {/* Example Payload */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-slate-500">Example Request Body</Label>
        <div className="relative">
          <pre className="bg-slate-900 text-slate-100 rounded-lg p-4 text-xs overflow-x-auto leading-relaxed">
            {examplePayload}
          </pre>
          <Button
            variant="ghost" size="icon"
            className="absolute top-2 right-2 h-7 w-7 bg-slate-800 hover:bg-slate-700"
            onClick={() => copyToClipboard(examplePayload, "Example")}
          >
            {copied === "Example" ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3 text-slate-400" />}
          </Button>
        </div>
        <p className="text-xs text-slate-400">
          Data lands at: <code className="bg-slate-100 px-1 rounded">Ring Digital/Current Clients/{client.client_name}/{campaignNameForExample}/Data/Original/{generatedFilename}.csv</code>
        </p>
      </div>

      {/* Copy Instructions */}
      {hasKey && (
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleCopyInstructions}>
          {copied === "Instructions" ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Mail className="h-3.5 w-3.5" />}
          {copied === "Instructions" ? "Copied!" : "Copy client instructions"}
        </Button>
      )}
    </div>
  );
}

export default function InboundPushConfig({ client, onUpdate }) {
  const [activeTab, setActiveTab] = useState("suppression");
  const activeType = LIST_TYPES.find(t => t.key === activeTab);

  const configuredCount = LIST_TYPES.filter(t => !!client[t.apiKeyField]).length;
  // Note: Target list endpoints are now managed per-product inside CampaignsManager.

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <Webhook className="h-4 w-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-slate-700">Inbound Push Endpoints</h3>
        <Badge variant="outline" className="text-xs">
          {configuredCount} / {LIST_TYPES.length} configured
        </Badge>
      </div>

      <p className="text-xs text-slate-500">
        Suppression and Conversion endpoints are configured here at the client level. Target list endpoints are managed per-product inside each Campaign.
      </p>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {LIST_TYPES.map((lt) => {
          const isConfigured = !!client[lt.apiKeyField];
          return (
            <button
              key={lt.key}
              onClick={() => setActiveTab(lt.key)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                activeTab === lt.key
                  ? lt.activeColor + " border-2"
                  : "border-slate-200 text-slate-500 hover:border-slate-300 bg-white"
              }`}
            >
              {lt.label}
              {isConfigured && (
                <span className={`h-2 w-2 rounded-full inline-block ${
                  lt.key === "suppression" ? "bg-amber-500" : "bg-emerald-500"
                }`} />
              )}
            </button>
          );
        })}
      </div>

      {/* Active Panel */}
      <div className="border border-slate-200 rounded-xl p-4">
        <EndpointPanel key={activeTab} client={client} listType={activeType} onUpdate={onUpdate} />
      </div>
    </div>
  );
}