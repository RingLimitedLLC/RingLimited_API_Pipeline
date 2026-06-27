import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Database, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Play, AlertTriangle, Loader2 } from "lucide-react";
import moment from "moment";
import SyncJobDialog from "@/components/client/SyncJobDialog";
import CollapsibleCard from "@/components/ui/CollapsibleCard";
import { toast } from "sonner";

const STATUS_COLORS = {
  "Success": "bg-emerald-100 text-emerald-700",
  "Failed": "bg-red-100 text-red-700",
  "Never Run": "bg-slate-100 text-slate-500",
};

function scheduleLabel(job) {
  if (job.frequency_type === "daily") return `Daily at ${formatTime(job.scheduled_time)}`;
  if (job.frequency_type === "weekly") {
    const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    return `Weekly ${days[parseInt(job.scheduled_day)] || ""} at ${formatTime(job.scheduled_time)}`;
  }
  if (job.frequency_type === "interval") return `Every ${job.interval_value} ${job.interval_unit}`;
  if (job.frequency_type === "custom_days") return `Every ${job.interval_value} day(s)`;
  if (job.frequency_type === "monthly") {
    const count = job.scheduled_dates?.length || 0;
    return count > 0 ? `Monthly — ${count} date${count !== 1 ? "s" : ""} selected` : "Monthly — no dates set";
  }
  if (job.frequency_type === "manual") return "Manual only";
  return "—";
}

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2,"0")} ${ampm}`;
}

/**
 * Returns true if a job is overdue (hasn't run within 2x its expected interval).
 * Only applies to enabled jobs that have run at least once.
 */
function isOverdue(job) {
  if (!job.is_enabled || !job.last_run_at || job.frequency_type === "manual") return false;
  const lastRun = moment(job.last_run_at);
  const now = moment();
  let expectedIntervalMinutes = null;

  if (job.frequency_type === "interval") {
    if (job.interval_unit === "minutes") expectedIntervalMinutes = job.interval_value;
    else if (job.interval_unit === "hours") expectedIntervalMinutes = job.interval_value * 60;
    else if (job.interval_unit === "days") expectedIntervalMinutes = job.interval_value * 1440;
  } else if (job.frequency_type === "daily") {
    expectedIntervalMinutes = 1440;
  } else if (job.frequency_type === "weekly" || job.frequency_type === "custom_days") {
    expectedIntervalMinutes = 7 * 1440;
  } else if (job.frequency_type === "monthly") {
    expectedIntervalMinutes = 30 * 1440;
  }

  if (!expectedIntervalMinutes) return false;
  const minutesSinceLastRun = now.diff(lastRun, "minutes");
  return minutesSinceLastRun > expectedIntervalMinutes * 2;
}

export default function SyncJobsManager({ client }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [runningJobIds, setRunningJobIds] = useState(new Set());
  const queryClient = useQueryClient();

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["syncJobs", client.id],
    queryFn: () => base44.entities.SyncJobs.filter({ client_id: client.id }, "-created_date"),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["syncJobs", client.id] });

  const handleDelete = async (job) => {
    await base44.entities.SyncJobs.delete(job.id);
    toast.success("Data pipeline deleted");
    refetch();
  };

  const handleToggle = async (job) => {
    await base44.entities.SyncJobs.update(job.id, { is_enabled: !job.is_enabled });
    toast.success(job.is_enabled ? "Job disabled" : "Job enabled");
    refetch();
  };

  const handleEdit = (job) => {
    setEditingJob(job);
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setEditingJob(null);
    setDialogOpen(true);
  };

  const handleSaved = () => {
    setDialogOpen(false);
    setEditingJob(null);
    refetch();
  };

  const handleRunNow = async (job) => {
    setRunningJobIds((prev) => new Set([...prev, job.id]));
    toast.info(`Running "${job.job_name}"…`);
    try {
      const res = await base44.functions.invoke("runSyncJob", {
        sync_job_id: job.id,
        connection_id: client.id,
      });
      const count = res.data?.records_processed ?? 0;
      toast.success(`"${job.job_name}" complete — ${count} record${count !== 1 ? "s" : ""} written to SharePoint`);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["syncLogs"] });
    } catch (err) {
      toast.error(`"${job.job_name}" failed: ${err.message}`);
      refetch();
    } finally {
      setRunningJobIds((prev) => { const next = new Set(prev); next.delete(job.id); return next; });
    }
  };

  return (
    <>
      <CollapsibleCard title="Data Pipelines" icon={Database} defaultOpen={false} onHeaderAction={handleAdd} onHeaderActionLabel="Add Pipeline">
        <CardContent className="px-5 pb-5 pt-4">
          {isLoading ? (
            <div className="space-y-2">
              {[1,2].map(i => <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />)}
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              No data pipelines configured yet. Click "Add Pipeline" to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map(job => (
                <div key={job.id} className={`flex items-center justify-between p-3 rounded-lg border ${job.is_enabled ? "bg-white border-slate-200" : "bg-slate-50 border-slate-200 opacity-60"}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-800">{job.job_name}</span>
                      <Badge variant="outline" className="text-xs">{job.object_type === "Custom" ? job.custom_object_name || "Custom" : job.object_type}</Badge>
                      <Badge className={`text-xs border-0 ${STATUS_COLORS[job.last_run_status] || STATUS_COLORS["Never Run"]}`}>
                        {job.last_run_status || "Never Run"}
                      </Badge>
                      {isOverdue(job) && (
                        <Badge className="text-xs border-0 bg-amber-100 text-amber-700 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> Overdue
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                      <span>{scheduleLabel(job)}</span>
                      {job.selected_fields?.length > 0 && (
                        <span>{job.selected_fields.length} field{job.selected_fields.length !== 1 ? "s" : ""}</span>
                      )}
                      {job.last_run_at && (
                        <span className={isOverdue(job) ? "text-amber-600 font-medium" : ""}>
                          Last run {moment(job.last_run_at).fromNow()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleRunNow(job)}
                      title={runningJobIds.has(job.id) ? "Running…" : "Run Now"}
                      disabled={runningJobIds.has(job.id)}
                    >
                      {runningJobIds.has(job.id)
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                        : <Play className="h-3.5 w-3.5 text-emerald-500" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleToggle(job)} title={job.is_enabled ? "Disable" : "Enable"}>
                      {job.is_enabled
                        ? <ToggleRight className="h-4 w-4 text-indigo-500" />
                        : <ToggleLeft className="h-4 w-4 text-slate-400" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(job)}>
                      <Pencil className="h-3.5 w-3.5 text-slate-400" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(job)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </CollapsibleCard>

      <SyncJobDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={handleSaved}
        client={client}
        job={editingJob}
      />
    </>
  );
}