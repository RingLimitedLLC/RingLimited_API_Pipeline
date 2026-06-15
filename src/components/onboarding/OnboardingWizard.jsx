import React, { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import StepClientInfo from "./StepClientInfo";
import StepCredentials from "./StepCredentials";
import StepSyncFrequency from "./StepSyncFrequency";
import StepSharePoint from "./StepSharePoint";
import StepReview from "./StepReview";

const STEPS = [
  { id: 1, label: "Client Info" },
  { id: 2, label: "Credentials" },
  { id: 3, label: "Sync Frequency" },
  { id: 4, label: "SharePoint" },
  { id: 5, label: "Review" },
];

const DEFAULT_FORM = {
  // Step 1
  client_name: "",
  crm_type: "HubSpot",
  api_base_url: "",
  initial_campaign: "",
  // Step 2
  auth_type: "API Key",
  api_key: "",
  access_token: "",
  // Step 3
  frequency_type: "daily",
  interval_value: 1,
  interval_unit: "hours",
  scheduled_time: "08:00",
  // Step 4
  campaign_name: "",
  sharepoint_filename: "",
};

export default function OnboardingWizard({ open, onOpenChange, onCreated }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(DEFAULT_FORM);

  const update = (fields) => setForm((prev) => ({ ...prev, ...fields }));

  const handleClose = () => {
    setStep(1);
    setForm(DEFAULT_FORM);
    onOpenChange(false);
  };

  const handleFinished = () => {
    handleClose();
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        {/* Progress bar */}
        <div className="flex border-b">
          {STEPS.map((s) => (
            <div
              key={s.id}
              className={`flex-1 py-3 text-center text-xs font-medium transition-colors ${
                s.id === step
                  ? "border-b-2 border-[#afd741] text-slate-900"
                  : s.id < step
                  ? "text-[#afd741]"
                  : "text-slate-400"
              }`}
            >
              <span
                className={`inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] mr-1.5 ${
                  s.id < step
                    ? "bg-[#afd741] text-white"
                    : s.id === step
                    ? "bg-slate-900 text-white"
                    : "bg-slate-200 text-slate-500"
                }`}
              >
                {s.id < step ? "✓" : s.id}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </div>
          ))}
        </div>

        <div className="p-6">
          {step === 1 && (
            <StepClientInfo form={form} update={update} onNext={() => setStep(2)} onSkip={() => setStep(5)} onCancel={handleClose} />
          )}
          {step === 2 && (
            <StepCredentials form={form} update={update} onNext={() => setStep(3)} onBack={() => setStep(1)} />
          )}
          {step === 3 && (
            <StepSyncFrequency form={form} update={update} onNext={() => setStep(4)} onBack={() => setStep(2)} />
          )}
          {step === 4 && (
            <StepSharePoint form={form} update={update} onNext={() => setStep(5)} onBack={() => setStep(3)} />
          )}
          {step === 5 && (
            <StepReview form={form} onBack={() => setStep(4)} onFinished={handleFinished} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}