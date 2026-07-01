import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { LayoutDashboard, Users, LogOut, Zap, Menu, ScrollText, Bell, ShieldAlert, Activity, BarChart2 } from "lucide-react";
import NotificationsBell from "@/components/notifications/NotificationsBell";
import { Button } from "@/components/ui/button";

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState({ full_name: "", email: "" });

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.name) {
          setUser({ full_name: data.name, email: data.email || "" });
        }
      })
      .catch(() => {});
  }, []);

  const navItems = [
  { name: "Dashboard", page: "Dashboard", icon: LayoutDashboard },
  { name: "Clients", page: "Dashboard", icon: Users },
  { name: "Performance", page: "Performance", icon: BarChart2 },
  { name: "Sync Health", page: "SyncHealth", icon: Activity },
  { name: "API Activity Log", page: "GlobalSyncLog", icon: ScrollText },
  { name: "Alerts", page: "Alerts", icon: ShieldAlert },
  { name: "Alert Rules", page: "AlertRules", icon: Bell }];



  return (
    <div className="min-h-screen bg-slate-50 flex">
      <style>{`
        :root {
          --color-primary: #0f172a;
          --color-accent: #6366f1;
        }
      `}</style>

      {/* Mobile overlay */}
      {sidebarOpen &&
      <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      }

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-slate-900 text-white z-50 flex flex-col
        transition-transform duration-300 ease-in-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0 lg:static lg:z-auto
      `}>
        <div className="bg-[#194155] p-4 border-b border-slate-800">
          <img
            src="https://media.base44.com/images/public/699cbedc49289690de21493a/da2cf7cd9_pipelinelogo.png"
            alt="Pipeline API Data Management"
            className="h-14 w-auto object-contain"
          />
        </div>

        <nav className="bg-[#194155] p-4 flex-1 space-y-1">
          {navItems.map((item) => {
            const isActive = currentPageName === item.page ||
            (currentPageName === "ClientDetail" && item.name === "Clients");
            return (
              <Link
                key={item.name}
                to={createPageUrl(item.page)}
                onClick={() => setSidebarOpen(false)} className="text-slate-50 px-3 py-2.5 text-sm font-medium rounded-lg flex items-center gap-3 transition-all hover:text-white hover:bg-slate-800">







                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>);

          })}
        </nav>

        <div className="bg-[#194155] p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-medium">
              {user?.full_name?.charAt(0) || "A"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate">{user?.full_name || "Admin"}</p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
            <NotificationsBell user={user} />
            <button
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.location.assign('/');
                }
              }}
              className="text-slate-500 hover:text-white transition-colors">

              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center justify-between p-4 border-b bg-white">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-indigo-500" />
            <span className="font-semibold text-sm">RING API</span>
          </div>
          <div className="w-10" />
        </header>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>);

}