import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CollapsibleCard({ title, icon: Icon, defaultOpen = false, children, className, onHeaderAction, onHeaderActionLabel }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className={cn("border-0 shadow-sm overflow-hidden", className)}>
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex-1 flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            {Icon && <Icon className="h-4 w-4 text-indigo-500" />}
            {title}
          </span>
          <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform duration-200", open && "rotate-180")} />
        </button>
        {onHeaderAction && (
          <button
            type="button"
            onClick={onHeaderAction}
            className="mr-4 flex items-center gap-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-2.5 py-1.5 rounded-md transition-colors shrink-0"
          >
            <Plus className="h-3 w-3" />
            {onHeaderActionLabel || "Add"}
          </button>
        )}
      </div>
      {open && <div className="border-t border-slate-100">{children}</div>}
    </Card>
  );
}