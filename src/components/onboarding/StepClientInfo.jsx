import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, ArrowRight, ArrowLeft, Eye, EyeOff, Info } from "lucide-react";

const CredentialField = ({ field, value, onChange }) => {
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
};

export default function StepClientInfo({ form, update, onNext, onBack }) {
  const ct = form.connection_type;
  const credFields = ct?.fields ?? [];
  const settingFields = ct?.settings ?? [];
  const hasSecrets = credFields.some((f) => f.secret);

  const updateField = (key, value) =>
    update({ connection_type_fields: { ...form.connection_type_fields, [key]: value } });

  const canProceed =
    form.client_name.trim() &&
    credFields
      .filter((f) => f.required)
      .every((f) => (form.connection_type_fields?.[f.key] || "").trim());

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-[#afd741]">
          <Building2 className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Client Details</h2>
          <p className="text-sm text-slate-500">{ct?.label} connection</p>
        </div>
      </div>

      {hasSecrets && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex gap-2 text-xs text-slate-600">
          <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
          Credentials are stored encrypted in 1Password and never exposed in the UI after saving.
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-slate-600">Client Name *</Label>
        <Input
          value={form.client_name}
          onChange={(e) => update({ client_name: e.target.value })}
          placeholder="e.g. Acme Corporation"
          autoFocus
        />
      </div>

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
            onChange={(v) => updateField(field.key, v)}
          />
        </div>
      ))}

      {settingFields.length > 0 && (
        <>
          <div className="border-t border-slate-100 pt-1">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Advanced Settings</p>
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
                onChange={(v) => updateField(field.key, v)}
              />
            </div>
          ))}
        </>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="ghost" onClick={onBack} className="text-slate-500">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Button
          onClick={onNext}
          disabled={!canProceed}
          style={{ backgroundColor: "#afd741" }}
          className="text-white"
        >
          Next <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
