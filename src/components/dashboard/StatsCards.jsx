import React from "react";
import { Card } from "@/components/ui/card";

export default function StatsCards({ stats }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, i) =>
      <Card key={i} className="p-5 border-0 shadow-sm bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{stat.label}</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</p>
            </div>
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center`} style={{ backgroundColor: "#afd741" }}>
              <stat.icon className="h-5 w-5 text-white" />
            </div>
          </div>
          {stat.sub && <p className="text-xs text-slate-400 mt-2">{stat.sub}</p>}
        </Card>
      )}
    </div>);

}