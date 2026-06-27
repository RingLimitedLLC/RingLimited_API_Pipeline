import React, { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import StepPlatform from "./StepPlatform";
import StepClientInfo from "./StepClientInfo";
import StepSyncFrequency from "./StepSyncFrequency";
import StepSharePoint from "./StepSharePoint";
import StepReview from "./StepReview";

const STEPS = [
  { id: 1, label: "Platform" },
  { id: 2, label: "Details" },
  { id: 3, label: "Schedule" },
  { id: 4, label: "Delivery" },
  { id: 5, label: "Review" },
];

const DEFAULT_FORM = {
  connection_type: null,
  client_name: "",
  connection_type_fields: {},
  frequency_type: "daily",
  interval_value: 1,
  interval_unit: "hours",
  scheduled_time: "08:00",
  scheduled_day: "1",
  sharepoint_folder: null,
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
            <StepPlatform
              form={form}
              update={update}
              onNext={() => setStep(2)}
              onCancel={handleClose}
            />
          )}
          {step === 2 && (
            <StepClientInfo
              form={form}
              update={update}
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <StepSyncFrequency
              form={form}
              update={update}
              onNext={() => setStep(4)}
              onBack={() => setStep(2)}
            />
          )}
          {step === 4 && (
            <StepSharePoint
              form={form}
              update={update}
              onNext={() => setStep(5)}
              onBack={() => setStep(3)}
            />
          )}
          {step === 5 && (
            <StepReview
              form={form}
              onBack={() => setStep(4)}
              onFinished={handleFinished}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
