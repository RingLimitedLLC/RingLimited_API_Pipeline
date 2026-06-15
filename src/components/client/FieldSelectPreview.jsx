import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Loader2, RefreshCw, Table2, AlertTriangle, CheckSquare, Square } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * FieldSelectPreview
 * Full-screen live data table where users can select fields by clicking column headers.
 * Ctrl+click to multi-select. Each selected header gets a toggle indicator.
 * Confirm returns the chosen fields to the parent.
 */
export default function FieldSelectPreview({ open, onClose, onConfirm, client, objectType, initialSelected = [], dateFilter = {} }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [records, setRecords] = useState([]);
  const [columns, setColumns] = useState([]);
  const [selected, setSelected] = useState(new Set(initialSelected));
  const [fetched, setFetched] = useState(false);
  const [activeRow, setActiveRow] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const wooPage = objectType === "Orders" ? "orders" : objectType.toLowerCase();
      const res = await base44.functions.invoke("fetchWooCommerceSchema", {
        client_id: client.id,
        woo_page: wooPage,
        include_sample: true,
        date_filter_type: dateFilter.date_filter_type,
        date_filter_field: dateFilter.date_filter_field,
        date_filter_relative_days: dateFilter.date_filter_relative_days,
        date_filter_start: dateFilter.date_filter_start,
        date_filter_end: dateFilter.date_filter_end,
      });
      const fields = res.data?.fields || [];
      const sample = res.data?.flat_records?.length > 0
        ? res.data.flat_records
        : res.data?.sample ? [res.data.sample] : [];
      if (fields.length === 0) {
        setError("No fields returned from live API.");
      } else {
        setColumns(fields);
        setRecords(sample);
        setFetched(true);
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open && !fetched) {
      fetchData();
    }
    if (!open) {
      setFetched(false);
      setRecords([]);
      setColumns([]);
      setError(null);
      setActiveRow(null);
    }
  }, [open]);

  // Re-sync initial selection when opened
  useEffect(() => {
    if (open) setSelected(new Set(initialSelected));
  }, [open]);

  const toggleColumn = (col, e) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(col)) {
        next.delete(col);
      } else {
        next.add(col);
      }
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(columns));
  const clearAll = () => setSelected(new Set());

  const handleConfirm = () => {
    onConfirm(Array.from(selected));
  };

  const cellValue = (row, col) => {
    const v = row?.[col];
    if (v === null || v === undefined) return <span className="text-slate-300 italic text-xs">—</span>;
    if (typeof v === "boolean") return <span className={cn("font-mono text-xs", v ? "text-emerald-600" : "text-red-400")}>{String(v)}</span>;
    return <span className="font-mono text-xs truncate">{String(v)}</span>;
  };

  if (!open) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col bg-slate-950/70 backdrop-blur-sm">
      <div className="flex flex-col bg-white w-full h-full shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <Table2 className="h-4 w-4 text-slate-400" />
            <div>
              <h2 className="text-sm font-semibold">Select Fields from Live Data</h2>
              <p className="text-xs text-slate-400">
                Click a column header to toggle selection · {objectType}
                {dateFilter?.date_filter_type === "relative" && dateFilter?.date_filter_relative_days && (
                  <span className="ml-2 text-amber-300">· Last {dateFilter.date_filter_relative_days}d filter applied</span>
                )}
                {dateFilter?.date_filter_type === "absolute" && dateFilter?.date_filter_start && (
                  <span className="ml-2 text-amber-300">· Date range filter applied</span>
                )}
              </p>
            </div>
            {columns.length > 0 && (
              <Badge className="bg-indigo-600 text-white text-xs ml-2">
                {selected.size} / {columns.length} selected
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline"
              className="h-7 text-xs gap-1.5 border-slate-600 text-slate-200 hover:bg-slate-800 bg-transparent"
              onClick={selectAll} disabled={loading}>
              Select All
            </Button>
            <Button size="sm" variant="outline"
              className="h-7 text-xs gap-1.5 border-slate-600 text-slate-200 hover:bg-slate-800 bg-transparent"
              onClick={clearAll} disabled={loading}>
              Clear
            </Button>
            <Button size="sm" variant="outline"
              className="h-7 text-xs gap-1.5 border-slate-600 text-slate-200 hover:bg-slate-800 bg-transparent"
              onClick={fetchData} disabled={loading}>
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {loading ? "Fetching…" : "Refresh"}
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-300 hover:text-white hover:bg-slate-800" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Fetching live schema…</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center h-64 gap-3 px-8 text-center">
              <AlertTriangle className="h-8 w-8 text-red-400" />
              <p className="text-sm font-medium text-red-700">Failed to fetch schema</p>
              <pre className="text-xs text-red-500 bg-red-50 border border-red-200 rounded p-3 max-w-xl text-left whitespace-pre-wrap">{error}</pre>
              <Button size="sm" variant="outline" onClick={fetchData}>Retry</Button>
            </div>
          )}

          {!loading && !error && columns.length > 0 && (
            <table className="min-w-max border-collapse text-xs">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="sticky left-0 z-20 bg-slate-800 text-slate-400 text-right px-3 py-2 font-normal border-r border-b border-slate-700 min-w-[3rem]">#</th>
                  {columns.map(col => {
                    const isSel = selected.has(col);
                    return (
                      <th
                        key={col}
                        onClick={(e) => toggleColumn(col, e)}
                        className={cn(
                          "px-3 py-2 text-left font-medium border-r border-b whitespace-nowrap cursor-pointer select-none transition-colors group",
                          isSel
                            ? "bg-indigo-600 text-white border-indigo-700"
                            : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          {isSel
                            ? <CheckSquare className="h-3 w-3 shrink-0" />
                            : <Square className="h-3 w-3 shrink-0 opacity-40 group-hover:opacity-70" />
                          }
                          {col}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 1} className="text-center py-8 text-slate-400 text-xs italic">
                      No sample row available — schema fields shown above
                    </td>
                  </tr>
                ) : records.map((row, ri) => (
                  <tr
                    key={ri}
                    onClick={() => setActiveRow(ri === activeRow ? null : ri)}
                    className={cn(
                      "transition-colors cursor-pointer",
                      ri === activeRow ? "bg-amber-50" : ri % 2 === 0 ? "bg-white hover:bg-slate-50" : "bg-slate-50 hover:bg-slate-100"
                    )}
                  >
                    <td className={cn(
                      "sticky left-0 z-10 text-right px-3 py-1.5 border-r border-b font-mono select-none transition-colors",
                      ri === activeRow ? "bg-amber-100 text-amber-800 border-amber-200 font-semibold" : "bg-slate-100 text-slate-400 border-slate-200"
                    )}>
                      {ri + 1}
                    </td>
                    {columns.map(col => {
                      const isSel = selected.has(col);
                      return (
                        <td
                          key={col}
                          className={cn(
                            "px-3 py-1.5 border-r border-b max-w-[240px] truncate transition-colors",
                            ri === activeRow && isSel ? "bg-indigo-100 border-indigo-200" :
                            ri === activeRow ? "bg-amber-50 border-amber-100" :
                            isSel ? "bg-indigo-50 border-indigo-100" :
                            "border-slate-100"
                          )}
                          title={String(row?.[col] ?? "")}
                        >
                          {cellValue(row, col)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 border-t bg-slate-50 flex items-center gap-4">
          <span className="text-xs text-slate-500">{selected.size} field{selected.size !== 1 ? "s" : ""} selected</span>
          {selected.size > 0 && (
            <div className="flex flex-wrap gap-1 flex-1 overflow-hidden max-h-8">
              {Array.from(selected).slice(0, 8).map(f => (
                <Badge key={f} className="text-xs bg-indigo-100 text-indigo-700 border border-indigo-200">{f}</Badge>
              ))}
              {selected.size > 8 && <Badge className="text-xs bg-slate-200 text-slate-600">+{selected.size - 8} more</Badge>}
            </div>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={handleConfirm}
              disabled={selected.size === 0}
            >
              Use {selected.size > 0 ? `${selected.size} ` : ""}Selected Fields
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}