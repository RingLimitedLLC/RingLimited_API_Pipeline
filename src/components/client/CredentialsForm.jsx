import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Loader2, KeyRound, Plug, CheckCircle2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import CollapsibleCard from "@/components/ui/CollapsibleCard";

const FALLBACK_CONNECTION_TYPES = [
  {
    id: "generic_api_key",
    label: "Generic API Key",
    aliases: ["API Key", "HubSpot", "Salesforce", "GoHighLevel", "Other"],
    defaultAuthType: "API Key",
    fields: [
      { key: "api_base_url", label: "API Base URL", kind: "url", required: true, secret: false, placeholder: "https://api.example.com" },
      { key: "api_key", label: "API Key", kind: "password", required: true, secret: true, placeholder: "Paste the API key" },
      { key: "webhook_secret", label: "Webhook Secret", kind: "password", required: false, secret: true, placeholder: "Optional webhook signing secret" },
    ],
    settings: [],
  },
  {
    id: "generic_oauth2",
    label: "OAuth2 / Bearer Token",
    aliases: ["OAuth2", "Bearer Token"],
    defaultAuthType: "OAuth2",
    fields: [
      { key: "api_base_url", label: "API Base URL", kind: "url", required: true, secret: false, placeholder: "https://api.example.com" },
      { key: "access_token", label: "Access Token", kind: "password", required: true, secret: true, placeholder: "Bearer access token" },
      { key: "refresh_token", label: "Refresh Token", kind: "password", required: false, secret: true, placeholder: "Optional refresh token" },
      { key: "webhook_secret", label: "Webhook Secret", kind: "password", required: false, secret: true, placeholder: "Optional webhook signing secret" },
    ],
    settings: [],
  },
  {
    id: "webhook_only",
    label: "Webhook Only",
    aliases: ["Webhook Only"],
    defaultAuthType: "Webhook Only",
    fields: [
      { key: "webhook_secret", label: "Webhook Secret", kind: "password", required: false, secret: true, placeholder: "Optional webhook signing secret" },
    ],
    settings: [],
  },
  {
    id: "client_post",
    label: "Client Post",
    aliases: ["Client Post"],
    defaultAuthType: "Client Post",
    fields: [
      { key: "inbound_api_key", label: "Inbound API Key", kind: "password", required: false, secret: true, placeholder: "Optional shared inbound key" },
    ],
    settings: [],
  },
  {
    id: "woocommerce",
    label: "WooCommerce",
    aliases: ["WooCommerce", "Woo Commerce", "woo_commerce"],
    defaultAuthType: "WooCommerce",
    testable: true,
    fields: [
      { key: "woo_login_url", label: "Store URL", kind: "url", required: true, secret: false, placeholder: "https://yourstore.com", aliases: ["api_base_url", "store_url"] },
      { key: "woo_consumer_key", label: "Consumer Key", kind: "password", required: true, secret: true, placeholder: "ck_..." },
      { key: "woo_consumer_secret", label: "Consumer Secret", kind: "password", required: true, secret: true, placeholder: "cs_..." },
    ],
    settings: [
      {
        key: "woo_version",
        label: "API Version",
        kind: "select",
        defaultValue: "wc/v3",
        options: [
          { value: "wc/v3", label: "wc/v3 (latest)" },
          { value: "wc/v2", label: "wc/v2" },
          { value: "wc/v1", label: "wc/v1" },
        ],
      },
      { key: "woo_user_agent", label: "User-Agent Header", kind: "text", defaultValue: "RingAPI/1.0", placeholder: "RingAPI/1.0" },
    ],
  },
];

const normalizeKey = (value = "") => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "");

const parseStatus = (value) => {
  if (!value) return {};
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const typeMatches = (connectionType, value) => {
  if (!value) return false;
  const normalized = normalizeKey(value);
  return [connectionType.id, connectionType.label, ...(connectionType.aliases || [])]
    .some((candidate) => normalizeKey(candidate) === normalized);
};

const resolveConnectionType = (client, connectionTypes) => {
  const explicit = connectionTypes.find((connectionType) => (
    typeMatches(connectionType, client?.connection_type) || typeMatches(connectionType, client?.crm_type)
  ));

  if (explicit) return explicit;

  return connectionTypes.find((connectionType) => (
    (connectionType.authTypes || [connectionType.defaultAuthType]).some((authType) => normalizeKey(authType) === normalizeKey(client?.auth_type))
  )) || connectionTypes[0];
};

const getClientFieldValue = (client, field) => {
  for (const key of [field.key, ...(field.aliases || [])]) {
    if (client?.[key]) return client[key];
  }
  return "";
};

const getInitialFieldValues = (client, connectionType) => Object.fromEntries(
  (connectionType.fields || [])
    .filter((field) => !field.secret)
    .map((field) => [field.key, getClientFieldValue(client, field)]),
);

const getInitialSettings = (client, connectionType) => Object.fromEntries(
  (connectionType.settings || []).map((setting) => [
    setting.key,
    client?.[setting.key] || setting.defaultValue || "",
  ]),
);

export default function CredentialsForm({ client, onUpdate }) {
  const [connectionTypes, setConnectionTypes] = useState(FALLBACK_CONNECTION_TYPES);
  const [selectedTypeId, setSelectedTypeId] = useState("generic_api_key");
  const [metadata, setMetadata] = useState({
    client_name: "",
    crm_type: "",
    auth_type: "",
  });
  const [fieldValues, setFieldValues] = useState({});
  const [settings, setSettings] = useState({});
  const [secrets, setSecrets] = useState({});
  const [replacing, setReplacing] = useState({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchConnectionTypes = async () => {
      try {
        const res = await base44.functions.invoke("listConnectionTypes", {});
        const nextTypes = res.data?.connection_types || res.data?.data || [];
        if (!cancelled && nextTypes.length) {
          setConnectionTypes(nextTypes);
        }
      } catch {
        if (!cancelled) {
          setConnectionTypes(FALLBACK_CONNECTION_TYPES);
        }
      }
    };

    fetchConnectionTypes();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!client || !connectionTypes.length) return;
    const connectionType = resolveConnectionType(client, connectionTypes);
    setSelectedTypeId(connectionType.id);
    setMetadata({
      client_name: client.client_name || "",
      crm_type: client.crm_type || connectionType.label,
      auth_type: client.auth_type || connectionType.defaultAuthType || "",
    });
    setFieldValues(getInitialFieldValues(client, connectionType));
    setSettings(getInitialSettings(client, connectionType));
    setSecrets({});
    setReplacing({});
  }, [client, connectionTypes]);

  const activeType = useMemo(
    () => connectionTypes.find((connectionType) => connectionType.id === selectedTypeId) || connectionTypes[0],
    [connectionTypes, selectedTypeId],
  );

  const fieldStatus = useMemo(() => parseStatus(client?.credential_field_status), [client]);

  const handleTypeChange = (connectionTypeId) => {
    const nextType = connectionTypes.find((connectionType) => connectionType.id === connectionTypeId);
    if (!nextType) return;

    setSelectedTypeId(nextType.id);
    setMetadata((prev) => ({
      ...prev,
      crm_type: nextType.label,
      auth_type: nextType.defaultAuthType || prev.auth_type,
    }));
    setFieldValues(getInitialFieldValues(client, nextType));
    setSettings(getInitialSettings(client, nextType));
    setSecrets({});
    setReplacing({});
  };

  const hasStored = (field) => {
    if (!field.secret) {
      return Boolean(fieldValues[field.key]);
    }

    return Boolean(fieldStatus[field.key] || client?.[field.key] === "••SET••");
  };

  const startReplacing = (fieldKey) => setReplacing((prev) => ({ ...prev, [fieldKey]: true }));
  const cancelReplacing = (fieldKey) => {
    setReplacing((prev) => ({ ...prev, [fieldKey]: false }));
    setSecrets((prev) => ({ ...prev, [fieldKey]: "" }));
  };

  const getSubmittedFields = () => Object.fromEntries((activeType.fields || [])
    .map((field) => {
      if (field.secret) {
        return replacing[field.key] && secrets[field.key]?.trim()
          ? [field.key, secrets[field.key].trim()]
          : null;
      }

      return [field.key, fieldValues[field.key]?.trim?.() || ""];
    })
    .filter(Boolean)
    .filter(([, value]) => value !== ""));

  const validateRequiredFields = (submittedFields) => {
    const missing = (activeType.fields || [])
      .filter((field) => field.required)
      .filter((field) => {
        if (!field.secret) {
          return !submittedFields[field.key];
        }

        return !hasStored(field) && !submittedFields[field.key];
      })
      .map((field) => field.label);

    if (missing.length) {
      toast.error(`Missing required fields: ${missing.join(", ")}`);
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    const submittedFields = getSubmittedFields();
    if (!validateRequiredFields(submittedFields)) return;

    setSaving(true);
    try {
      const res = await base44.functions.invoke("saveConnectionCredentials", {
        client_id: client.id,
        connection_type: activeType.id,
        crm_type: metadata.crm_type,
        auth_type: metadata.auth_type,
        client_name: metadata.client_name,
        fields: submittedFields,
        settings,
      });

      if (!res.data?.success) {
        throw new Error(res.data?.message || "Credential save failed");
      }

      toast.success("Connection credentials saved");
      onUpdate();
      setReplacing({});
      setSecrets({});
    } catch (err) {
      toast.error(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const res = await base44.functions.invoke("testConnection", { client_id: client.id });
      if (res.data?.success) {
        toast.success(`Credential lookup succeeded (${res.data.source || "configured vault"})`);
      } else {
        toast.error(res.data?.message || "Credential lookup failed");
      }
      onUpdate();
    } catch (err) {
      toast.error(`Test failed: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  const SecretField = ({ field }) => {
    const isReplacing = replacing[field.key];
    const stored = hasStored(field);

    return (
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-slate-500">
          {field.label}{field.required && <span className="text-red-400 ml-1">*</span>}
        </Label>
        {!isReplacing ? (
          <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-slate-50 text-sm">
            {stored ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                <span className="text-slate-400 flex-1 text-xs tracking-widest">••••••••••••</span>
                <button
                  type="button"
                  onClick={() => startReplacing(field.key)}
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
                  onClick={() => startReplacing(field.key)}
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
              value={secrets[field.key] || ""}
              onChange={(e) => setSecrets((prev) => ({ ...prev, [field.key]: e.target.value }))}
              placeholder={field.placeholder || "••••••••"}
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => cancelReplacing(field.key)}
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

  const PlainField = ({ field }) => (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-slate-500">
        {field.label}{field.required && <span className="text-red-400 ml-1">*</span>}
      </Label>
      <Input
        type={field.kind === "url" ? "url" : "text"}
        value={fieldValues[field.key] || ""}
        onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
        placeholder={field.placeholder || ""}
      />
    </div>
  );

  const SettingField = ({ setting }) => (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-slate-500">{setting.label}</Label>
      {setting.kind === "select" ? (
        <Select
          value={settings[setting.key] || setting.defaultValue || ""}
          onValueChange={(value) => setSettings((prev) => ({ ...prev, [setting.key]: value }))}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {(setting.options || []).map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          value={settings[setting.key] || ""}
          onChange={(e) => setSettings((prev) => ({ ...prev, [setting.key]: e.target.value }))}
          placeholder={setting.placeholder || ""}
        />
      )}
    </div>
  );

  if (!activeType) {
    return null;
  }

  return (
    <CollapsibleCard title="Connection Credentials" icon={KeyRound} defaultOpen={false}>
      <CardContent className="space-y-5 pt-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-500">Client Name</Label>
            <Input
              value={metadata.client_name}
              onChange={(e) => setMetadata((prev) => ({ ...prev, client_name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-500">Connection Type</Label>
            <Select value={selectedTypeId} onValueChange={handleTypeChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {connectionTypes.map((connectionType) => (
                  <SelectItem key={connectionType.id} value={connectionType.id}>{connectionType.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {(activeType.fields || []).length > 0 && (
          <div className="border-t pt-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">1Password Fields</p>
              <p className="text-xs text-slate-400">Secret values are write-only after saving</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {(activeType.fields || []).map((field) => (
                field.secret
                  ? <SecretField key={field.key} field={field} />
                  : <PlainField key={field.key} field={field} />
              ))}
            </div>
          </div>
        )}

        {(activeType.settings || []).length > 0 && (
          <div className="border-t pt-5 space-y-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Connection Settings</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {(activeType.settings || []).map((setting) => (
                <SettingField key={setting.key} setting={setting} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="pt-4 gap-3">
        <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Credentials
        </Button>
        {activeType.testable && (
          <Button variant="outline" onClick={handleTestConnection} disabled={testing}>
            {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plug className="h-4 w-4 mr-2" />}
            Test Connection
          </Button>
        )}
      </CardFooter>
    </CollapsibleCard>
  );
}
