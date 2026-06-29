import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from "@/api/base44Client";
import {
  Plug, Key, KeyRound, ShieldCheck, Send, ShoppingCart, Webhook,
  ArrowLeft, ArrowRight, CheckCircle2, Loader2, Info, Eye, EyeOff, ArrowDownToLine,
} from "lucide-react";
import { toast } from "sonner";

const PLATFORM_ICONS = {
  woocommerce: ShoppingCart,
  generic_api_key: Key,
  generic_oauth2: ShieldCheck,
  webhook_only: Webhook,
  client_post: Send,
};

function CredentialField({ field, value, onChange }) {
  const [show, setShow] = useState(false);

  if (field.kind === "select") {
    return (
      <Select value={value || field.defaultValue || ""} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {(field.options || []).map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (field.secret) {
    return (
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || ""}
          className="pr-10"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  }

  return (
    <Input
      type={field.kind === "url" ? "url" : "text"}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder || ""}
    />
  );
}

const DEFAULT_FORM = {
  campaign_id: "",
  campaign_name: "",
  connection_type: null,
  connection_type_fields: {},
};

export default function AddConnectionDialog({ open, onOpenChange, client, campaigns, onCreated }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  const update = (fields) => setForm((prev) => ({ ...prev, ...fields }));

  const { data: connectionTypes = [], isLoading: typesLoading } = useQuery({
    queryKey: ["connectionTypes"],
    queryFn: async () => {
      const result = await base44.functions.invoke("listConnectionTypes");
      return result.data?.connection_types ?? [];
    },
    staleTime: Infinity,
    enabled: open,
  });

  const handleClose = () => {
    setStep(1);
    setForm(DEFAULT_FORM);
    onOpenChange(false);
  };

  const ct = form.connection_type;
  const isInbound = ct?.direction === "inbound";
  const credFields = ct?.fields ?? [];
  const settingFields = ct?.settings ?? [];
  const hasSecrets = credFields.some((f) => f.secret);
  const requiredCredFields = credFields.filter((f) => f.required);

  // Auto-select campaign when there is only one
  const singleCampaign = campaigns.length === 1 ? campaigns[0] : null;
  const effectiveCampaignId = singleCampaign ? singleCampaign.id : form.campaign_id;
  const effectiveCampaignName = singleCampaign ? singleCampaign.campaign_name : form.campaign_name;

  const canProceedStep1 =
    form.connection_type && (campaigns.length <= 1 || form.campaign_id);

  const canSave =
    isInbound ||
    requiredCredFields.every((f) => (form.connection_type_fields?.[f.key] || "").trim());

  const handleSave = async () => {
    setSaving(true);
    try {
      const connection = await base44.entities.Connections.create({
        client_id: client.id,
        client_name: client.client_name,
        campaign_id: effectiveCampaignId,
        campaign_name: effectiveCampaignName,
        connection_type: ct?.id,
        platform_label: ct?.label,
        direction: ct?.direction || "outbound",
        connection_status: "Not Connected",
        frequency_type: "manual",
        sharepoint_folder_id: "",
        sharepoint_folder_path: "",
      });

      const allFields = [...credFields, ...settingFields];
      const hasFilledFields = allFields.some((f) =>
        (form.connection_type_fields?.[f.key] || "").trim()
      );

      if (hasFilledFields) {
        try {
          await base44.functions.invoke("saveConnectionCredentials", {
            connection_id: connection.id,
            connection_type: ct?.id,
            fields: form.connection_type_fields,
          });
        } catch (credErr) {
          toast.warning(
            `Connection created, but credentials could not be saved: ${credErr.message}. ` +
            `Re-enter them from the connection card.`
          );
          handleClose();
          onCreated();
          return;
        }
      }

      toast.success(`${ct?.label} connection added.`);
      handleClose();
      onCreated();
    } catch (err) {
      toast.error(`Failed to create connection: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plug className="h-4 w-4 text-slate-400" />
            Add Connection
          </DialogTitle>
        </DialogHeader>

        {/* ── Step 1: Platform + Campaign ───────────────────────── */}
        {step === 1 && (
          <div className="space-y-5 pt-1">
            {campaigns.length > 1 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">Campaign *</Label>
                <Select
                  value={form.campaign_id}
                  onValueChange={(id) => {
                    const c = campaigns.find((c) => c.id === id);
                    update({ campaign_id: id, campaign_name: c?.campaign_name || "" });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select a campaign…" /></SelectTrigger>
                  <SelectContent>
                    {campaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.campaign_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Connection Type *</Label>
              {typesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {connectionTypes.map((type) => {
                    const Icon = PLATFORM_ICONS[type.id] ?? Plug;
                    const isSelected = form.connection_type?.id === type.id;
                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => update({ connection_type: type, connection_type_fields: {} })}
                        className={`rounded-xl border-2 p-4 text-left transition-all ${
                          isSelected
                            ? "border-[#afd741] bg-lime-50"
                            : "border-slate-200 hover:border-slate-300 bg-white"
                        }`}
                      >
                        <Icon className={`h-5 w-5 mb-2 ${isSelected ? "text-[#afd741]" : "text-slate-400"}`} />
                        <p className="text-sm font-semibold text-slate-800">{type.label}</p>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{type.description}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-between pt-1">
              <Button variant="ghost" onClick={handleClose} className="text-slate-500">Cancel</Button>
              <Button
                onClick={() => setStep(2)}
                disabled={!canProceedStep1}
                style={{ backgroundColor: "#afd741" }}
                className="text-white"
              >
                Next <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Credentials ───────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-5 pt-1">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#afd741" }}>
                {isInbound
                  ? <ArrowDownToLine className="h-5 w-5 text-white" />
                  : <KeyRound className="h-5 w-5 text-white" />}
              </div>
              <div>
                <p className="text-base font-semibold text-slate-900">{ct?.label}</p>
                <p className="text-sm text-slate-500">
                  {isInbound ? "Inbound — client pushes data to us" : "Enter API credentials"}
                </p>
              </div>
            </div>

            {isInbound ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                <p className="font-medium">Inbound connection</p>
                <p className="text-blue-700 mt-1">
                  The client pushes data to a generated webhook endpoint. No outbound credentials are needed.
                  Endpoint details will be shown on the connection card once created.
                </p>
              </div>
            ) : (
              <>
                {hasSecrets && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex gap-2 text-xs text-slate-600">
                    <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                    Credentials are encrypted and stored in 1Password. They will not be visible in the UI after saving.
                  </div>
                )}

                {credFields.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600">
                      {field.label}
                      {field.required
                        ? " *"
                        : <span className="text-slate-400 font-normal"> (optional)</span>}
                    </Label>
                    <CredentialField
                      field={field}
                      value={form.connection_type_fields?.[field.key] || ""}
                      onChange={(v) =>
                        update({ connection_type_fields: { ...form.connection_type_fields, [field.key]: v } })
                      }
                    />
                  </div>
                ))}

                {settingFields.length > 0 && (
                  <>
                    <div className="border-t border-slate-100 pt-1">
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                        Advanced Settings
                      </p>
                    </div>
                    {settingFields.map((field) => (
                      <div key={field.key} className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-600">
                          {field.label}
                          <span className="text-slate-400 font-normal"> (optional)</span>
                        </Label>
                        <CredentialField
                          field={field}
                          value={form.connection_type_fields?.[field.key] || ""}
                          onChange={(v) =>
                            update({ connection_type_fields: { ...form.connection_type_fields, [field.key]: v } })
                          }
                        />
                      </div>
                    ))}
                  </>
                )}
              </>
            )}

            <div className="flex justify-between pt-1">
              <Button variant="ghost" onClick={() => setStep(1)} className="text-slate-500" disabled={saving}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button
                onClick={handleSave}
                disabled={!canSave || saving}
                style={{ backgroundColor: "#afd741" }}
                className="text-white px-6"
              >
                {saving
                  ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  : <CheckCircle2 className="h-4 w-4 mr-2" />}
                {saving ? "Creating…" : "Create Connection"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
