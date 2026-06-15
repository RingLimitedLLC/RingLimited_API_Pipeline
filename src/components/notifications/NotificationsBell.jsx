import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import moment from "moment";

const severityDot = { Info: "bg-blue-500", Warning: "bg-yellow-500", Critical: "bg-red-500" };

export default function NotificationsBell({ user }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ["inAppNotifications", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return base44.entities.Notifications.filter(
        { user_id: user.id, channel: "IN_APP" },
        "-created_date",
        30
      );
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ["openAlerts"],
    queryFn: () => base44.entities.Alerts.filter({ status: "Open" }, "-created_date", 50),
    refetchInterval: 30000,
  });

  const unread = notifications.filter(n => n.status === "Sent" || n.status === "Queued");
  const unreadCount = unread.length;

  const markRead = async (notif) => {
    if (notif.status === "Read") return;
    await base44.entities.Notifications.update(notif.id, {
      status: "Read",
      read_at: new Date().toISOString(),
    });
    queryClient.invalidateQueries({ queryKey: ["inAppNotifications"] });
  };

  const markAllRead = async () => {
    await Promise.all(
      unread.map(n => base44.entities.Notifications.update(n.id, { status: "Read", read_at: new Date().toISOString() }))
    );
    queryClient.invalidateQueries({ queryKey: ["inAppNotifications"] });
  };

  // Build a combined list: notifications + open alerts without notifications
  const alertMap = Object.fromEntries(alerts.map(a => [a.id, a]));
  const alertsWithNotif = new Set(notifications.map(n => n.alert_id));
  const alertsWithoutNotif = alerts.filter(a => !alertsWithNotif.has(a.id)).slice(0, 10);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-300 hover:text-white">
          <Bell className="h-5 w-5" />
          {(unreadCount > 0 || alertsWithoutNotif.length > 0) && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 shadow-xl" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-semibold text-slate-800">Notifications</h3>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-indigo-600 hover:underline">
                Mark all read
              </button>
            )}
            <Link to={createPageUrl("Alerts")} onClick={() => setOpen(false)}>
              <span className="text-xs text-slate-500 hover:text-indigo-600">View alerts →</span>
            </Link>
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
          {notifications.length === 0 && alertsWithoutNotif.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">No notifications</div>
          ) : (
            <>
              {notifications.map(notif => {
                const alert = alertMap[notif.alert_id];
                const isUnread = notif.status !== "Read";
                return (
                  <div
                    key={notif.id}
                    className={`px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${isUnread ? "bg-indigo-50/50" : ""}`}
                    onClick={() => markRead(notif)}
                  >
                    <div className="flex items-start gap-2">
                      {alert?.severity && (
                        <span className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${severityDot[alert.severity] || "bg-slate-400"}`} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${isUnread ? "font-medium text-slate-800" : "text-slate-600"}`}>
                          {alert?.title || "Alert"}
                        </p>
                        {alert?.message && <p className="text-xs text-slate-500 truncate mt-0.5">{alert.message}</p>}
                        <p className="text-xs text-slate-400 mt-1">{moment(notif.created_date).fromNow()}</p>
                      </div>
                      {isUnread && <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 mt-2 flex-shrink-0" />}
                    </div>
                  </div>
                );
              })}
              {alertsWithoutNotif.map(alert => (
                <Link
                  key={alert.id}
                  to={createPageUrl("Alerts")}
                  onClick={() => setOpen(false)}
                  className="block px-4 py-3 hover:bg-slate-50 transition-colors bg-orange-50/40"
                >
                  <div className="flex items-start gap-2">
                    <span className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${severityDot[alert.severity] || "bg-slate-400"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{alert.title}</p>
                      {alert.message && <p className="text-xs text-slate-500 truncate mt-0.5">{alert.message}</p>}
                      <p className="text-xs text-slate-400 mt-1">{moment(alert.created_date).fromNow()}</p>
                    </div>
                    <Badge className="bg-orange-100 text-orange-700 border-0 text-xs">Open</Badge>
                  </div>
                </Link>
              ))}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}