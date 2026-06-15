import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Loader2, RefreshCw, Table2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ApiDataPreview({ open, onClose, config, client, filteredColumns, fieldMappings }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [records, setRecords] = useState([]);
  const [columns, setColumns] = useState([]);
  const [activeRow, setActiveRow] = useState(null);
  const [activeCol, setActiveCol] = useState(null);
  const [fetched, setFetched] = useState(false);
  const tableRef = useRef(null);

  const fetchPreview = async () => {
    setLoading(true);
    setError(null);
    setActiveRow(null);
    setActiveCol(null);
    try {
      const res = await base44.functions.invoke("previewApiData", {
        client_id: client?.id || null,
        endpoint: config.api_endpoint,
        method: config.api_method || "GET",
        auth_type: config.api_auth_type,
        auth_value: config.api_auth_value,
        auth_header_name: config.api_auth_header_name,
        request_body: config.api_request_body || null,
        preview_limit: 25,
      });
      if (res.data?.error) {
        setError(res.data.error + (res.data.detail ? `\n\n${res.data.detail}` : ""));
        setRecords([]);
        setColumns([]);
      } else {
        setRecords(res.data.records || []);
        setColumns(res.data.columns || []);
        setFetched(true);
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  // Trigger fetch when opened (first time only)
  useEffect(() => {
    if (open && !fetched && config?.api_endpoint) {
      fetchPreview();
    }
    if (!open) {
      setFetched(false);
      setRecords([]);
      setColumns([]);
      setError(null);
      setActiveRow(null);
      setActiveCol(null);
    }
  }, [open]);

  if (!open) return null;

  // If filteredColumns provided, only show those cols and remap headers to destination names
  const displayColumns = filteredColumns && filteredColumns.length > 0
    ? columns.filter(c => filteredColumns.includes(c))
    : columns;

  const mappingLabel = (col) => {
    if (!fieldMappings) return col;
    const m = fieldMappings.find(m => m.source === col);
    return m?.destination ? `${m.destination}` : col;
  };

  const cellValue = (row, col) => {
    const v = row[col];
    if (v === null || v === undefined) return <span className="text-slate-300 italic text-xs">null</span>;
    if (typeof v === "boolean") return <span className={cn("font-mono text-xs", v ? "text-emerald-600" : "text-red-500")}>{String(v)}</span>;
    return <span className="font-mono text-xs">{String(v)}</span>;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/60 backdrop-blur-sm">
      <div className="flex flex-col bg-white w-full h-full max-h-full shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <Table2 className="h-4 w-4 text-slate-400" />
            <div>
              <h2 className="text-sm font-semibold">API Data Preview</h2>
              <p className="text-xs text-slate-400 font-mono truncate max-w-xl">{config?.api_endpoint || "—"}</p>
            </div>
            {records.length > 0 && (
              <Badge className="bg-indigo-600 text-white text-xs ml-2">{records.length} rows · {displayColumns.length} cols{filteredColumns ? " (filtered)" : ""}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5 border-slate-600 text-slate-200 hover:bg-slate-800 bg-transparent"
              onClick={fetchPreview}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {loading ? "Fetching…" : "Refresh"}
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-300 hover:text-white hover:bg-slate-800" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Active cell hint */}
        {(activeRow !== null || activeCol !== null) && (
          <div className="px-5 py-2 bg-indigo-50 border-b border-indigo-100 flex items-center gap-3 shrink-0">
            {activeCol !== null && (
              <span className="text-xs text-indigo-700 font-mono bg-indigo-100 px-2 py-0.5 rounded">
                col: <strong>{activeCol}</strong>
              </span>
            )}
            {activeRow !== null && activeCol !== null && records[activeRow] && (
              <span className="text-xs text-slate-600 font-mono truncate max-w-lg">
                {String(records[activeRow][activeCol] ?? "null")}
              </span>
            )}
            <button className="ml-auto text-xs text-indigo-400 hover:text-indigo-700" onClick={() => { setActiveRow(null); setActiveCol(null); }}>
              clear
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-auto" ref={tableRef}>
          {loading && (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Calling API endpoint…</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center h-64 gap-3 px-8 text-center">
              <AlertTriangle className="h-8 w-8 text-red-400" />
              <p className="text-sm font-medium text-red-700">API call failed</p>
              <pre className="text-xs text-red-500 bg-red-50 border border-red-200 rounded p-3 max-w-xl text-left whitespace-pre-wrap">{error}</pre>
              <Button size="sm" variant="outline" onClick={fetchPreview}>Retry</Button>
            </div>
          )}

          {!loading && !error && records.length === 0 && fetched && (
            <div className="flex flex-col items-center justify-center h-64 gap-2 text-slate-400">
              <Table2 className="h-8 w-8" />
              <p className="text-sm">No records returned from this endpoint</p>
            </div>
          )}

          {!loading && !error && records.length > 0 && (
            <table className="min-w-max border-collapse text-xs">
              <thead className="sticky top-0 z-10">
                <tr>
                  {/* Row number header */}
                  <th className="sticky left-0 z-20 bg-slate-800 text-slate-400 text-right px-3 py-2 font-normal border-r border-b border-slate-700 min-w-[3rem]">
                    #
                  </th>
                  {displayColumns.map((col) => (
                   <th
                     key={col}
                     onClick={() => setActiveCol(col === activeCol ? null : col)}
                     className={cn(
                       "px-3 py-2 text-left font-medium border-r border-b whitespace-nowrap cursor-pointer select-none transition-colors",
                       col === activeCol
                         ? "bg-indigo-600 text-white border-indigo-700"
                         : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
                     )}
                   >
                     <div className="flex flex-col gap-0.5">
                       <span>{mappingLabel(col)}</span>
                       {fieldMappings && mappingLabel(col) !== col && (
                         <span className="text-slate-400 font-normal text-[10px] italic">{col}</span>
                       )}
                     </div>
                   </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((row, ri) => (
                  <tr
                    key={ri}
                    className={cn(
                      "transition-colors",
                      ri === activeRow ? "bg-amber-50" : ri % 2 === 0 ? "bg-white" : "bg-slate-50"
                    )}
                  >
                    {/* Row number */}
                    <td
                      onClick={() => setActiveRow(ri === activeRow ? null : ri)}
                      className={cn(
                        "sticky left-0 z-10 text-right px-3 py-1.5 border-r border-b cursor-pointer select-none font-mono transition-colors",
                        ri === activeRow
                          ? "bg-amber-100 text-amber-800 border-amber-200 font-semibold"
                          : "bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200"
                      )}
                    >
                      {ri + 1}
                    </td>
                    {displayColumns.map((col) => (
                      <td
                        key={col}
                        onClick={() => { setActiveRow(ri); setActiveCol(col); }}
                        className={cn(
                          "px-3 py-1.5 border-r border-b max-w-[280px] truncate cursor-pointer transition-colors",
                          ri === activeRow && col === activeCol
                            ? "bg-indigo-600 text-white border-indigo-700"
                            : ri === activeRow
                            ? "bg-amber-50 border-amber-100"
                            : col === activeCol
                            ? "bg-indigo-50 border-indigo-100"
                            : "border-slate-100 hover:bg-slate-100"
                        )}
                        title={String(row[col] ?? "")}
                      >
                        {ri === activeRow && col === activeCol
                          ? <span className="font-mono text-xs text-white">{String(row[col] ?? "null")}</span>
                          : cellValue(row, col)
                        }
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {records.length > 0 && !loading && (
          <div className="shrink-0 px-5 py-2.5 border-t bg-slate-50 flex items-center gap-4 text-xs text-slate-500">
            <span>{records.length} records previewed (max 25)</span>
            <span>·</span>
            <span>{displayColumns.length} columns{filteredColumns ? ` (${columns.length} total)` : ""}</span>
            {activeRow !== null && <><span>·</span><span>Row {activeRow + 1} selected</span></>}
            {activeCol !== null && <><span>·</span><span>Column <strong className="text-slate-700">{activeCol}</strong> selected</span></>}
          </div>
        )}
      </div>
    </div>
  );
}