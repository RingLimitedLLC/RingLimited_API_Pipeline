import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Loader2, CalendarClock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import CollapsibleCard from "@/components/ui/CollapsibleCard";

const FREQUENCY_OPTIONS = [
  { label: "Every 15 minutes", value: "15min" },
  { label: "Every 30 minutes", value: "30min" },
  { label: "Every hour", value: "1hr" },
  { label: "Every 6 hours", value: "6hr" },
  { label: "Every 12 hours", value: "12hr" },
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
];

const TIME_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const hour = i % 12 === 0 ? 12 : i % 12;
  const ampm = i < 12 ? "AM" : "PM";
  return { label: `${hour}:00 ${ampm}`, value: `${String(i).padStart(2, "0")}:00` };
});

const DAY_OPTIONS = [
  { label: "Sunday", value: "0" },
  { label: "Monday", value: "1" },
  { label: "Tuesday", value: "2" },
  { label: "Wednesday", value: "3" },
  { label: "Thursday", value: "4" },
  { label: "Friday", value: "5" },
  { label: "Saturday", value: "6" },
];

export default function SyncScheduler({ client, onUpdate }) {
  const schedule = client.sync_schedule || {};

  const [frequency, setFrequency] = useState(schedule.frequency || "1hr");
  const [time, setTime] = useState(schedule.time || "09:00");
  const [day, setDay] = useState(schedule.day || "1");
  const [startDate, setStartDate] = useState(schedule.start_date || "");
  const [startTime, setStartTime] = useState(schedule.start_time || "09:00");
  const [saving, setSaving] = useState(false);

  const showTime = ["daily", "weekly"].includes(frequency);
  const showDay = frequency === "weekly";

  const handleSave = async () => {
    setSaving(true);
    await base44.entities.Clients.update(client.id, {
      sync_schedule: { enabled: true, frequency, time, day, start_date: startDate, start_time: startTime },
    });
    toast.success("Sync schedule saved");
    onUpdate();
    setSaving(false);
  };

  return (
    <CollapsibleCard title="Sync Schedule" icon={Clock} defaultOpen={false}>
      <CardContent className="px-5 pb-5 pt-5 space-y-4">
        {/* Campaign Start Date */}
        <div className="p-3 rounded-lg border border-indigo-100 bg-indigo-50/50 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700">
            <CalendarClock className="h-3.5 w-3.5" />
            Campaign Start Date
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-500">Start Date</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-500">Start Time</Label>
              <Select value={startTime} onValueChange={setStartTime}>
                <SelectTrigger>
                  <SelectValue placeholder="Select time" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Recurring frequency */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-500">Frequency</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger>
                <SelectValue placeholder="Select frequency" />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showTime && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-500">Time of Day</Label>
              <Select value={time} onValueChange={setTime}>
                <SelectTrigger>
                  <SelectValue placeholder="Select time" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showDay && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-500">Day of Week</Label>
              <Select value={day} onValueChange={setDay}>
                <SelectTrigger>
                  <SelectValue placeholder="Select day" />
                </SelectTrigger>
                <SelectContent>
                  {DAY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Save Schedule
          </Button>
        </div>
      </CardContent>
    </CollapsibleCard>
  );
}