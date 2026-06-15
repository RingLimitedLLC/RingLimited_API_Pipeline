import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Loader2, KeyRound, Plug, CheckCircle2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import CollapsibleCard from "@/components/ui/CollapsibleCard";

// Fields that are secret and should never be pre-populated from DB
const SECRET_FIELDS = [
  "api_key", "access_token", "refresh_token", "webhook_secret",
  "woo_consumer_key", "woo_consumer_secret",
];

const EMPTY_SECRETS = Object.fromEntries(SECRET_FIELDS.map(k => [k, ""]));

export default function CredentialsForm({ client, onUpdate }) {
  // Non-secret config fields only
  const [form, setForm] = useState({
    client_name: "",
    crm_type: "HubSpot",
    api_base_url: "",
    auth_type: "API Key",
    woo_version: "wc/v3",
    woo_user_agent: "RingAPI/1.0",
  });

  // Secret fields are always blank on load — write-only
  const [secrets, setSecrets] = useState(EMPTY_SECRETS);

  // Track which secret fields the user has chosen to replace
  const [replacing, setReplacing] = useState({});

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (client) {
      setForm({
        client_name: client.client_name || "",
        crm_type: client.crm_type || "HubSpot",
        api_base_url: client.api_base_url || "",
        auth_type: client.auth_type || "API Key",
        woo_version: client.woo_version || "wc/v3",
        woo_user_agent: client.woo_user_agent || "RingAPI/1.0",
      });
      // Never read secrets from client — reset to blank
      setSecrets(EMPTY_SECRETS);
      setReplacing({});
    }
  }, [client]);

  const isWoo = form.crm_type === "WooCommerce";

  // A field is "stored" if it has any non-empty value (including the "••SET••" sentinel from sanitizeClient)
  const hasStored = (field) => !!client?.[field] && client[field] !== "";

  const startReplacing = (field) => setReplacing(prev => ({ ...prev, [field]: true }));
  const cancelReplacing = (field) => {
    setReplacing(prev => ({ ...prev, [field]: false }));
    setSecrets(prev => ({ ...prev, [field]: "" }));
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      ...form,
      ...(isWoo ? { auth_type: "WooCommerce" } : {}),
    };

    // Only include secrets that the user explicitly typed a new value for
    SECRET_FIELDS.forEach(field => {
      if (replacing[field] && secrets[field].trim()) {
        payload[field] = secrets[field].trim();
      }
    });

    await base44.entities.Clients.update(client.id, payload);
    toast.success("Credentials saved");
    onUpdate();
    setReplacing({});
    setSecrets(EMPTY_SECRETS);
    setSaving(false);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const res = await base44.functions.invoke("testWooCommerceConnection", { client_id: client.id });
      if (res.data?.success) {
        toast.success(`Connected! WooCommerce API responded (HTTP ${res.data.status_code})`);
      } else {
        toast.error(`Connection failed (HTTP ${res.data?.status_code}): ${res.data?.error || "Unknown error"}`);
      }
      onUpdate();
    } catch (err) {
      toast.error(`Test failed: ${err.message}`);
    }
    setTesting(false);
  };

  const SecretField = ({ fieldKey, label, placeholder = "••••••••" }) => {
    const isReplacing = replacing[fieldKey];
    const stored = hasStored(fieldKey);

    return (
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-slate-500">{label}</Label>
        {!isReplacing ? (
          <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-slate-50 text-sm">
            {stored ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                <span className="text-slate-400 flex-1 text-xs tracking-widest">••••••••••••</span>
                <button
                  type="button"
                  onClick={() => startReplacing(fieldKey)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  Replace
                </button>
              </>
            ) : (
              <>
                <span className="text-slate-400 flex-1 text-xs italic">Not set</span>
                <button
                  type="button"
                  onClick={() => startReplacing(fieldKey)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  Set
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              type="password"
              autoFocus
              value={secrets[fieldKey]}
              onChange={e => setSecrets(prev => ({ ...prev, [fieldKey]: e.target.value }))}
              placeholder={placeholder}
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => cancelReplacing(fieldKey)}
              className="text-slate-400 hover:text-slate-600"
              title="Cancel"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    );
  };

  const secretFields = [
    { key: "api_key", label: "API Key", show: form.auth_type === "API Key" && !isWoo },
    { key: "access_token", label: "Access Token", show: form.auth_type === "OAuth2" && !isWoo },
    { key: "refresh_token", label: "Refresh Token", show: form.auth_type === "OAuth2" && !isWoo },
    { key: "webhook_secret", label: "Webhook Secret", show: !isWoo },
  ];

  return (
    <CollapsibleCard title="CRM Credentials" icon={KeyRound} defaultOpen={false}>
      <CardContent className="space-y-5 pt-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-500">Client Name</Label>
            <Input value={form.client_name} onChange={e => setForm({...form, client_name: e.target.value})} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-500">CRM Type</Label>
            <Select value={form.crm_type} onValueChange={v => setForm({...form, crm_type: v, auth_type: v === "WooCommerce" ? "WooCommerce" : form.auth_type})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="HubSpot">HubSpot</SelectItem>
                <SelectItem value="Salesforce">Salesforce</SelectItem>
                <SelectItem value="GoHighLevel">GoHighLevel</SelectItem>
                <SelectItem value="WooCommerce">WooCommerce</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-500">{isWoo ? "Store URL" : "API Base URL"}</Label>
            <Input
              value={form.api_base_url}
              onChange={e => setForm({...form, api_base_url: e.target.value})}
              placeholder={isWoo ? "https://yourstore.com" : "https://api.example.com"}
            />
          </div>
          {!isWoo && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-500">Auth Type</Label>
              <Select value={form.auth_type} onValueChange={v => setForm({...form, auth_type: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="API Key">API Key</SelectItem>
                  <SelectItem value="OAuth2">OAuth2</SelectItem>
                  <SelectItem value="Webhook Only">Webhook Only</SelectItem>
                  <SelectItem value="Client Post">Client Post</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* WooCommerce-specific fields */}
        {isWoo && (
          <div className="border-t pt-5 space-y-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">WooCommerce API Settings</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <SecretField fieldKey="woo_consumer_key" label="Consumer Key" placeholder="ck_••••••••" />
              <SecretField fieldKey="woo_consumer_secret" label="Consumer Secret" placeholder="cs_••••••••" />
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-500">API Version</Label>
                <Select value={form.woo_version} onValueChange={v => setForm({...form, woo_version: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wc/v3">wc/v3 (latest)</SelectItem>
                    <SelectItem value="wc/v2">wc/v2</SelectItem>
                    <SelectItem value="wc/v1">wc/v1</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-500">User-Agent Header</Label>
                <Input
                  value={form.woo_user_agent}
                  onChange={e => setForm({...form, woo_user_agent: e.target.value})}
                  placeholder="RingAPI/1.0"
                />
              </div>
            </div>
          </div>
        )}

        {/* Standard secret fields for non-WooCommerce */}
        {!isWoo && secretFields.filter(f => f.show).length > 0 && (
          <div className="border-t pt-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Secrets</p>
              <p className="text-xs text-slate-400">Write-only — values are never shown after saving</p>
            </div>
            {secretFields.filter(f => f.show).map(field => (
              <SecretField key={field.key} fieldKey={field.key} label={field.label} />
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter className="pt-4 gap-3">
        <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Credentials
        </Button>
        {isWoo && (
          <Button variant="outline" onClick={handleTestConnection} disabled={testing}>
            {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plug className="h-4 w-4 mr-2" />}
            Test Connection
          </Button>
        )}
      </CardFooter>
    </CollapsibleCard>
  );
}