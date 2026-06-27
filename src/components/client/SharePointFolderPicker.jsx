import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { internalApiClient } from "@/api/internalApiClient";
import { ChevronRight, Home, Folder, FolderOpen, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SharePointFolderPicker({ value, onChange }) {
  // breadcrumb: [{ id: null, name: "Root" }, { id: "...", name: "Documents" }, ...]
  const [breadcrumb, setBreadcrumb] = useState([{ id: null, name: "Root" }]);
  const currentItem = breadcrumb[breadcrumb.length - 1];

  const { data, isLoading, error } = useQuery({
    queryKey: ["sharepoint-browse", currentItem.id],
    queryFn: () => internalApiClient.sharepoint.browse(currentItem.id),
    staleTime: 60_000,
  });

  const folders = data?.items ?? [];

  const navigateInto = (folder) => {
    setBreadcrumb((prev) => [...prev, { id: folder.id, name: folder.name }]);
  };

  const navigateTo = (index) => {
    setBreadcrumb((prev) => prev.slice(0, index + 1));
  };

  const selectedPath = breadcrumb
    .slice(1)
    .map((b) => b.name)
    .join(" / ");

  const isSelected =
    value?.id === currentItem.id && currentItem.id !== null;

  return (
    <div className="space-y-3">
      {/* Breadcrumb trail */}
      <nav className="flex items-center gap-1 flex-wrap text-sm min-h-[24px]">
        {breadcrumb.map((crumb, i) => (
          <React.Fragment key={i}>
            {i > 0 && <ChevronRight className="h-3 w-3 text-slate-300 shrink-0" />}
            <button
              type="button"
              onClick={() => navigateTo(i)}
              className={`flex items-center gap-1 hover:text-indigo-600 transition-colors rounded px-1 ${
                i === breadcrumb.length - 1
                  ? "text-slate-900 font-medium"
                  : "text-slate-500"
              }`}
            >
              {i === 0 ? <Home className="h-3.5 w-3.5" /> : crumb.name}
            </button>
          </React.Fragment>
        ))}
      </nav>

      {/* Folder list */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div className="max-h-60 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading folders…</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-8 gap-2 text-red-500">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error.message || "Failed to load folders"}</span>
            </div>
          ) : folders.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">
              No sub-folders here
            </div>
          ) : (
            folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                onClick={() => navigateInto(folder)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left border-b border-slate-100 last:border-0 transition-colors group"
              >
                <Folder className="h-4 w-4 text-slate-400 shrink-0 group-hover:text-indigo-400" />
                <span className="text-sm text-slate-800 flex-1 truncate">{folder.name}</span>
                {folder.childCount > 0 && (
                  <span className="text-xs text-slate-400 mr-1">{folder.childCount}</span>
                )}
                <ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-indigo-400" />
              </button>
            ))
          )}
        </div>

        {/* Select current folder bar */}
        {currentItem.id !== null && (
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <FolderOpen className="h-4 w-4 text-[#afd741] shrink-0" />
              <span className="text-xs text-slate-600 truncate">{currentItem.name}</span>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() =>
                onChange({ id: currentItem.id, name: currentItem.name, path: selectedPath })
              }
              style={isSelected ? {} : { backgroundColor: "#afd741" }}
              variant={isSelected ? "outline" : "default"}
              className={isSelected ? "text-slate-600" : "text-white"}
            >
              {isSelected ? "Selected ✓" : "Select folder"}
            </Button>
          </div>
        )}
      </div>

      {value && (
        <p className="text-xs text-slate-500">
          Delivery path:{" "}
          <span className="font-medium text-slate-800">{value.path || value.name}</span>
        </p>
      )}
    </div>
  );
}
