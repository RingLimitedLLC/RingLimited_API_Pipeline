import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  RefreshCw, Eye, EyeOff, Copy, Check, Loader2, Plus, Trash2,
  GripVertical, AlertCircle, ArrowDownToLine, ChevronDown, ChevronUp,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import CollapsibleCard from "@/components/ui/CollapsibleCard";

const FIELD_TYPES = ["string", "number", "boolean", "date"];
const ENDPOINT_URL = "https://pipeline.ring.digital/api/apps/67b8f9ccbc57b4f9994fb5c3/functions/inboundPush";

function generateApiKey() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "rpk_";
  for (let i = 0; i < 40; i++) key += chars[Math.floor(Math.random() * chars.length)];
  return key;
}

// ── Shared sub-components ────────────────────────────────────────────────────

function FieldSchemaEditor({ fields, onChange }) {
  const add = () => onChange([...fields, { name: "", type: "string", required: true }]);
  const update = (i, k, v) => onChange(fields.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const remove = (i) => onChange(fields.filter((_, j) => j !== i));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">Required Fields</p>
        <Button variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={add} type="button">
          <Plus className="h-3 w-3" /> Add Field
        </Button>
      </div>
      {fields.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 rounded-lg p-3 border border-dashed">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> No fields defined — all incoming fields will be accepted.
        </div>
      )}
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {fields.map((field, i) => (
          <div key={i} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
            <GripVertical className="h-3.5 w-3.5 text-slate-300 shrink-0" />
            <input
              placeholder="field_name"
              value={field.name}
              onChange={e => update(i, "name", e.target.value.replace(/\s+/g, "_").toLowerCase())}
              className="font-mono text-xs h-7 flex-1 border border-input rounded-md px-2 bg-white focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <Select value={field.type} onValueChange={v => update(i, "type", v)}>
              <SelectTrigger className="h-7 text-xs w-24 shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>{FIELD_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
            </Select>
            <button
              type="button"
              onClick={() => update(i, "required", !field.required)}
              className={`text-xs px-2 py-1 rounded border font-medium shrink-0 ${field.required ? "bg-red-50 text-red-600 border-red-200" : "bg-slate-100 text-slate-400 border-slate-200"}`}
            >
              {field.required ? "Req" : "Opt"}
            </button>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-slate-400 hover:text-red-500" onClick={() => remove(i)} type="button">
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ApiKeyRow({ apiKey, onRegenerate, regenerating, onCopy, copied, copyLabel }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-slate-500">API Key</p>
      {apiKey ? (
        <div className="flex gap-1.5 items-center">
          <code className="text-xs bg-slate-50 border rounded px-2 py-1 flex-1 truncate font-mono">
            {visible ? apiKey : apiKey.slice(0, 7) + "•".repeat(16)}
          </code>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setVisible(v => !v)}>
            {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
          {visible && (
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onCopy(apiKey, copyLabel)}>
              {copied === copyLabel ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          )}
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={onRegenerate} disabled={regenerating} title="Regenerate">
            <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} />
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={onRegenerate} disabled={regenerating}>
          {regenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Generate API Key
        </Button>
      )}
    </div>
  );
}

// ── Product card ─────────────────────────────────────────────────────────────

function ProductInboundCard({ product, campaign, clientName }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [fields, setFields] = useState(() => { try { return JSON.parse(product.inbound_field_schema || "[]"); } catch { return []; } });
  const [fieldsChanged, setFieldsChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(null);

  const copy = async (text, label) => {
    await navigator.clipboard.writeText(text);
    setCopied(label); setTimeout(() => setCopied(null), 2500);
    toast({ title: "Copied!" });
  };

  const handleSaveFields = async () => {
    setSaving(true);
    await base44.entities.CampaignProducts.update(product.id, { inbound_field_schema: JSON.stringify(fields.filter(f => f.name.trim())) });
    queryClient.invalidateQueries({ queryKey: ["campaignProducts", campaign.id] });
    setSaving(false); setFieldsChanged(false);
    toast({ title: "Fields saved" });
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    await base44.entities.CampaignProducts.update(product.id, { inbound_api_key: generateApiKey() });
    queryClient.invalidateQueries({ queryKey: ["campaignProducts", campaign.id] });
    setRegenerating(false); toast({ title: "API key regenerated" });
  };

  const buildInstructions = () => {
    const fieldLines = fields.length > 0 ? fields.map(f => `  - ${f.name} (${f.type})${f.required ? " [required]" : " [optional]"}`).join("\n") : "  - No specific fields defined.";
    const exampleRecord = fields.length > 0 ? "{" + fields.map(f => `"${f.name}": ""`).join(", ") + "}" : '{ "field1": "value1" }';
    return `=== Inbound Push Integration Instructions ===
Product: ${product.product_name}
Campaign: ${campaign.campaign_name}
Client: ${clientName}

ENDPOINT
POST ${ENDPOINT_URL}

AUTHENTICATION
  Authorization: Bearer ${product.inbound_api_key}

REQUEST BODY
{
  "product_id": "${product.id}",
  "campaign_name": "${campaign.campaign_name}",
  "filename": "T_X_${clientName}_YYYY-MM-DD_${product.product_name}",
  "records": [ ${exampleRecord} ]
}

FIELDS
${fieldLines}

For questions, contact your DataOps representative.`;
  };

  return (
    <div className="border rounded-lg bg-white p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-800">{product.product_name}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-mono">{product.status}</span>
        </div>
        {product.inbound_api_key && (
          <Button variant="outline" size="sm" className="h-6 text-xs gap-1 px-2" onClick={() => copy(buildInstructions(), `instr-${product.id}`)}>
            {copied === `instr-${product.id}` ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
            {copied === `instr-${product.id}` ? "Copied!" : "Copy Instructions"}
          </Button>
        )}
      </div>

      <ApiKeyRow apiKey={product.inbound_api_key} onRegenerate={handleRegenerate} regenerating={regenerating} onCopy={copy} copied={copied} copyLabel={`key-${product.id}`} />

      <div className="space-y-1">
        <p className="text-xs font-medium text-slate-500">Product ID</p>
        <div className="flex gap-1.5">
          <code className="text-xs bg-slate-50 border rounded px-2 py-1 flex-1 truncate font-mono text-slate-600">{product.id}</code>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => copy(product.id, `pid-${product.id}`)}>
            {copied === `pid-${product.id}` ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      <FieldSchemaEditor fields={fields} onChange={(f) => { setFields(f); setFieldsChanged(true); }} />

      {fieldsChanged && (
        <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSaveFields} disabled={saving}>
          {saving && <Loader2 className="h-3 w-3 animate-spin" />} Save Fields
        </Button>
      )}

      {product.inbound_api_key && (
        <div className="bg-slate-900 rounded-lg p-2.5 text-xs overflow-x-auto">
          <pre className="text-slate-300 leading-relaxed whitespace-pre-wrap">{`POST ${ENDPOINT_URL}
Authorization: Bearer ${product.inbound_api_key.slice(0, 7)}•••

{
  "product_id": "${product.id}",
  "campaign_name": "${campaign.campaign_name}",
  "filename": "T_X_${clientName}_YYYY-MM-DD_${product.product_name}",
  "records": [{ "field1": "value1", ... }]
  }`}</pre>
        </div>
      )}
    </div>
  );
}

// ── Campaign section (collapsible within the card) ───────────────────────────

function CampaignInboundSection({ campaign, client, clientName }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [suppFields, setSuppFields] = useState(() => { try { return JSON.parse(client?.inbound_suppression_field_schema || "[]"); } catch { return []; } });
  const [suppFieldsChanged, setSuppFieldsChanged] = useState(false);
  const [savingSupp, setSavingSupp] = useState(false);
  const [generatingSupp, setGeneratingSupp] = useState(false);
  const [suppCopied, setSuppCopied] = useState(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["campaignProducts", campaign.id],
    queryFn: () => base44.entities.CampaignProducts.filter({ campaign_id: campaign.id }, "product_name"),
    enabled: open,
  });

  const copySupp = async (text, label) => {
    await navigator.clipboard.writeText(text);
    setSuppCopied(label); setTimeout(() => setSuppCopied(null), 2500);
    toast({ title: "Copied!" });
  };

  const handleSaveSuppFields = async () => {
    setSavingSupp(true);
    await base44.entities.Clients.update(client.id, { inbound_suppression_field_schema: JSON.stringify(suppFields.filter(f => f.name.trim())) });
    queryClient.invalidateQueries({ queryKey: ["client", client.id] });
    setSavingSupp(false); setSuppFieldsChanged(false);
    toast({ title: "Suppression fields saved" });
  };

  const handleGenerateSuppKey = async () => {
    setGeneratingSupp(true);
    await base44.entities.Clients.update(client.id, { inbound_suppression_api_key: generateApiKey() });
    queryClient.invalidateQueries({ queryKey: ["client", client.id] });
    setGeneratingSupp(false); toast({ title: "Suppression API key generated" });
  };

  const buildSuppInstructions = () => {
    const fieldLines = suppFields.length > 0
      ? suppFields.map(f => `  - ${f.name} (${f.type})${f.required ? " [required]" : " [optional]"}`).join("\n")
      : "  - No specific fields defined.";
    return `=== Ring Data Ops — Suppression List Inbound Push ===
Client: ${clientName}

ENDPOINT
POST ${ENDPOINT_URL}

AUTHENTICATION
  Authorization: Bearer ${client?.inbound_suppression_api_key || ""}

REQUEST BODY
{
  "client_id": "${client?.id}",
  "list_type": "suppression",
  "campaign_name": "${campaign.campaign_name}",
  "filename": "S_X_${clientName?.replace(/\s+/g, "_")}_YYYY-MM-DD",
  "records": [{ ${suppFields.map(f => `"${f.name}": ""`).join(", ") || '"field1": "value1"'} }]
}

FIELDS
${fieldLines}

For questions, contact your DataOps representative.`;
  };

  return (
    <div className="border rounded-lg bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700">{campaign.campaign_name}</span>
          {products.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded">
              {products.length} product{products.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {open && (
        <div className="border-t bg-slate-50 px-4 py-4 space-y-4">
          {/* Target products */}
          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</div>
          ) : products.length === 0 ? (
            <p className="text-xs text-slate-400">No target list products found for this campaign.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Target List Products</p>
              {products.map(p => (
                <ProductInboundCard key={p.id} product={p} campaign={campaign} clientName={clientName} />
              ))}
            </div>
          )}

          {/* Suppression — client-level */}
          <div className="border rounded-lg bg-white p-3 space-y-3 border-amber-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-amber-700">Suppression List Inbound Push</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Client-level</span>
              </div>
              {client.inbound_suppression_api_key && (
                <Button variant="outline" size="sm" className="h-6 text-xs gap-1 px-2" onClick={() => copySupp(buildSuppInstructions(), "supp-instr")}>
                  {suppCopied === "supp-instr" ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                  {suppCopied === "supp-instr" ? "Copied!" : "Copy Instructions"}
                </Button>
              )}
            </div>
            <p className="text-xs text-slate-500">Shared across all campaigns for this client.</p>

            <ApiKeyRow
              apiKey={client.inbound_suppression_api_key}
              onRegenerate={handleGenerateSuppKey}
              regenerating={generatingSupp}
              onCopy={copySupp}
              copied={suppCopied}
              copyLabel="supp-key"
            />

            <FieldSchemaEditor fields={suppFields} onChange={(f) => { setSuppFields(f); setSuppFieldsChanged(true); }} />

            {suppFieldsChanged && (
              <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSaveSuppFields} disabled={savingSupp}>
                {savingSupp && <Loader2 className="h-3 w-3 animate-spin" />} Save Fields
              </Button>
            )}

            {client.inbound_suppression_api_key && (
              <div className="bg-slate-900 rounded-lg p-2.5 text-xs overflow-x-auto">
                <pre className="text-slate-300 leading-relaxed whitespace-pre-wrap">{`POST ${ENDPOINT_URL}
Authorization: Bearer ${client.inbound_suppression_api_key.slice(0, 7)}•••

{
  "client_id": "${client.id}",
  "list_type": "suppression",
  "campaign_name": "${campaign.campaign_name}",
  "filename": "S_X_${clientName?.replace(/\s+/g, "_")}_YYYY-MM-DD",
  "records": [{ "field1": "value1", ... }]
}`}</pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

export default function InboundPushManager({ client }) {
  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns", client.id],
    queryFn: () => base44.entities.Campaigns.filter({ client_id: client.id }, "campaign_name"),
  });

  return (
    <CollapsibleCard title="Inbound Push" icon={ArrowDownToLine} defaultOpen={false}>
      <CardContent className="px-5 pb-5 pt-4">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />)}
          </div>
        ) : campaigns.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">No campaigns found. Create a campaign first.</p>
        ) : (
          <div className="space-y-2">
            {campaigns.map(c => (
              <CampaignInboundSection key={c.id} campaign={c} client={client} clientName={client.client_name} />
            ))}
          </div>
        )}
      </CardContent>
    </CollapsibleCard>
  );
}