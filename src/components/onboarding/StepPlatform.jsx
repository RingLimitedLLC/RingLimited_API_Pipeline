import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, X, Plug, Key, ShieldCheck, Send, ShoppingCart, Loader2, Webhook,
} from "lucide-react";

const PLATFORM_ICONS = {
  woocommerce: ShoppingCart,
  generic_api_key: Key,
  generic_oauth2: ShieldCheck,
  webhook_only: Webhook,
  client_post: Send,
};

export default function StepPlatform({ form, update, onNext, onCancel }) {
  const { data: connectionTypes = [], isLoading } = useQuery({
    queryKey: ["connectionTypes"],
    queryFn: async () => {
      const result = await base44.functions.invoke("listConnectionTypes");
      return result.data?.connection_types ?? [];
    },
    staleTime: Infinity,
  });

  const selected = form.connection_type;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-[#afd741]">
          <Plug className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Select Platform</h2>
          <p className="text-sm text-slate-500">Choose the connection type you want to add</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {connectionTypes.map((ct) => {
            const Icon = PLATFORM_ICONS[ct.id] ?? Plug;
            const isSelected = selected?.id === ct.id;
            return (
              <button
                key={ct.id}
                type="button"
                onClick={() => update({ connection_type: ct, connection_type_fields: {} })}
                className={`rounded-xl border-2 p-4 text-left transition-all ${
                  isSelected
                    ? "border-[#afd741] bg-lime-50"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <Icon className={`h-5 w-5 mb-2 ${isSelected ? "text-[#afd741]" : "text-slate-400"}`} />
                <p className="text-sm font-semibold text-slate-800">{ct.label}</p>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{ct.description}</p>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="ghost" onClick={onCancel} className="text-slate-500">
          <X className="h-4 w-4 mr-1" /> Cancel
        </Button>
        <Button
          onClick={onNext}
          disabled={!selected}
          style={{ backgroundColor: "#afd741" }}
          className="text-white"
        >
          Next <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
