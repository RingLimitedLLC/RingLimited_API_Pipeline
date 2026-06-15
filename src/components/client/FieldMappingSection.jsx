import React from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronUp } from "lucide-react";

// Suggested destination schema fields per object type
export const DEST_SCHEMA = {
  Leads:       ["first_name","last_name","email","phone","company_name","lead_source","status","created_at","owner_email"],
  Contacts:    ["first_name","last_name","email","phone","company_name","job_title","created_at","owner_email"],
  Deals:       ["deal_name","pipeline_stage","deal_value","currency","close_date","owner_email","contact_email","company_name"],
  Companies:   ["name","website_domain","industry","headcount","annual_revenue","country"],
  Conversions: ["contact_ref","deal_ref","converted_at","revenue_value","traffic_source","campaign_name"],
  Custom:      [],
};

export default function FieldMappingSection({ fieldMappings, objectType, open, onToggle, onUpdate }) {
  const destOptions = DEST_SCHEMA[objectType] || [];

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-sm font-medium text-slate-700"
      >
        <span>
          Field Mapping
          <span className="text-slate-400 font-normal text-xs ml-1">— map CRM fields to destination schema</span>
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {open && (
        <div className="p-4 border-t space-y-3">
          <p className="text-xs text-slate-400">For each source field, choose or type the destination field name in your schema.</p>
          <div className="space-y-2">
            {fieldMappings.map((mapping) => (
              <div key={mapping.source} className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
                <div className="bg-slate-100 text-slate-600 text-xs font-mono px-2 py-1.5 rounded truncate">
                  {mapping.source}
                </div>
                <span className="text-slate-400 text-xs mt-1.5">→</span>
                <div className="space-y-1">
                  {destOptions.length > 0 ? (
                    <Select
                      value={mapping.destination === "__custom__" || !destOptions.includes(mapping.destination) && mapping.destination ? "__custom__" : mapping.destination}
                      onValueChange={v => onUpdate(mapping.source, v)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select destination…" />
                      </SelectTrigger>
                      <SelectContent>
                        {destOptions.map(d => <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>)}
                        <SelectItem value="__custom__" className="text-xs text-slate-400">Custom field…</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : null}
                  {(mapping.destination === "__custom__" || (destOptions.length > 0 && mapping.destination && !destOptions.includes(mapping.destination)) || destOptions.length === 0) && (
                    <Input
                      className="h-8 text-xs font-mono"
                      placeholder="custom_field_name"
                      value={mapping.destination === "__custom__" ? "" : mapping.destination}
                      onChange={e => onUpdate(mapping.source, e.target.value)}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}