import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KeyRound, ArrowRight, ArrowLeft, Eye, EyeOff, Info } from "lucide-react";

const AUTH_TYPES = [
  { value: "API Key", label: "API Key" },
  { value: "OAuth2", label: "OAuth2 / Bearer Token" },
  { value: "Webhook Only", label: "Webhook Only" },
  { value: "Client Post", label: "Client Post" },
];

export default function StepCredentials({ form, update, onNext, onBack }) {
  const [showKey, setShowKey] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const canProceed =
    form.auth_type === "Webhook Only" ||
    form.auth_type === "Client Post" ||
    (form.auth_type === "API Key" && form.api_key.trim()) ||
    (form.auth_type === "OAuth2" && form.access_token.trim());

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#afd741" }}>
          <KeyRound className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">API Credentials</h2>
          <p className="text-sm text-slate-500">Securely store connection credentials for this client</p>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex gap-2 text-xs text-slate-600">
        <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
        Credentials are stored encrypted and never exposed in the UI after saving.
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-slate-600">Authentication Type *</Label>
        <Select value={form.auth_type} onValueChange={(v) => update({ auth_type: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {AUTH_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {form.auth_type === "API Key" && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-slate-600">API Key *</Label>
          <div className="relative">
            <Input
              type={showKey ? "text" : "password"}
              value={form.api_key}
              onChange={(e) => update({ api_key: e.target.value })}
              placeholder="Paste your API key here"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {form.auth_type === "OAuth2" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">Access Token *</Label>
            <div className="relative">
              <Input
                type={showToken ? "text" : "password"}
                value={form.access_token}
                onChange={(e) => update({ access_token: e.target.value })}
                placeholder="Bearer access token"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">Refresh Token <span className="text-slate-400 font-normal">(optional)</span></Label>
            <Input
              type="password"
              value={form.refresh_token || ""}
              onChange={(e) => update({ refresh_token: e.target.value })}
              placeholder="Refresh token for auto-renewal"
            />
          </div>
        </div>
      )}

      {(form.auth_type === "Webhook Only" || form.auth_type === "Client Post") && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
          No credentials needed for <strong>{form.auth_type}</strong>. The client will push data to your endpoint directly.
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="ghost" onClick={onBack} className="text-slate-500">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Button onClick={onNext} disabled={!canProceed} style={{ backgroundColor: "#afd741" }} className="text-white">
          Next <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}