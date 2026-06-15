import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, ArrowRight, ArrowLeft } from "lucide-react";

const FREQUENCY_OPTIONS = [
  { value: "interval", label: "Every X minutes/hours", icon: "⚡" },
  { value: "daily", label: "Once daily at a set time", icon: "📅" },
  { value: "weekly", label: "Weekly on a specific day", icon: "🗓️" },
  { value: "manual", label: "Manual only", icon: "🖱️" },
];

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function StepSyncFrequency({ form, update, onNext, onBack }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#afd741" }}>
          <Clock className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Sync Frequency</h2>
          <p className="text-sm text-slate-500">How often should we pull data from this client's CRM?</p>
        </div>
      </div>

      {/* Frequency type cards */}
      <div className="grid grid-cols-2 gap-2">
        {FREQUENCY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => update({ frequency_type: opt.value })}
            className={`rounded-xl border-2 p-3 text-left transition-all ${
              form.frequency_type === opt.value
                ? "border-[#afd741] bg-lime-50"
                : "border-slate-200 hover:border-slate-300 bg-white"
            }`}
          >
            <div className="text-lg mb-1">{opt.icon}</div>
            <div className="text-sm font-medium text-slate-800">{opt.label}</div>
          </button>
        ))}
      </div>

      {/* Interval config */}
      {form.frequency_type === "interval" && (
        <div className="flex gap-3 items-end">
          <div className="space-y-1.5 flex-1">
            <Label className="text-xs font-medium text-slate-600">Every</Label>
            <Input
              type="number"
              min={1}
              value={form.interval_value}
              onChange={(e) => update({ interval_value: parseInt(e.target.value) || 1 })}
            />
          </div>
          <div className="space-y-1.5 flex-1">
            <Label className="text-xs font-medium text-slate-600">Unit</Label>
            <Select value={form.interval_unit} onValueChange={(v) => update({ interval_unit: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="minutes">Minutes</SelectItem>
                <SelectItem value="hours">Hours</SelectItem>
                <SelectItem value="days">Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Daily config */}
      {form.frequency_type === "daily" && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-slate-600">Run at (HH:MM)</Label>
          <Input
            type="time"
            value={form.scheduled_time}
            onChange={(e) => update({ scheduled_time: e.target.value })}
          />
        </div>
      )}

      {/* Weekly config */}
      {form.frequency_type === "weekly" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">Day of week</Label>
            <Select
              value={form.scheduled_day || "1"}
              onValueChange={(v) => update({ scheduled_day: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">Run at (HH:MM)</Label>
            <Input
              type="time"
              value={form.scheduled_time}
              onChange={(e) => update({ scheduled_time: e.target.value })}
            />
          </div>
        </div>
      )}

      {form.frequency_type === "manual" && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
          Sync jobs will only run when triggered manually from the client detail page.
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="ghost" onClick={onBack} className="text-slate-500">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Button onClick={onNext} style={{ backgroundColor: "#afd741" }} className="text-white">
          Next <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}