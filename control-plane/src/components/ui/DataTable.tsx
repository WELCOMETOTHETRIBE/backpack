"use client";

import { useState, useMemo } from "react";
import { Search, ChevronUp, ChevronDown } from "lucide-react";

export type DataTableColumn<T = Record<string, unknown>> = {
  key: string;
  label: string;
  sortable?: boolean;
  /** Optional: custom cell render. Receives row data and value at key. */
  render?: (row: T, value: unknown) => React.ReactNode;
};

type SortDir = "asc" | "desc";

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  searchPlaceholder = "Search…",
  emptyState,
  onRowClick,
  getRowHref,
}: {
  columns: DataTableColumn<T>[];
  data: T[];
  searchPlaceholder?: string;
  emptyState?: React.ReactNode;
  onRowClick?: (row: T) => void;
  getRowHref?: (row: T) => string;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return data;
    const q = searchQuery.toLowerCase().trim();
    return data.filter((row) => {
      const str = JSON.stringify(Object.values(row)).toLowerCase();
      return str.includes(q);
    });
  }, [data, searchQuery]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      const aStr = aVal != null ? String(aVal) : "";
      const bStr = bVal != null ? String(bVal) : "";
      const cmp = aStr.localeCompare(bStr, undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const showSearch = data.length > 3;
  const isEmpty = sorted.length === 0;

  return (
    <div className="space-y-4">
      {showSearch && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F172A]/10"
            aria-label="Search table"
          />
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.05)]">
        {isEmpty ? (
          <div className="py-12">{emptyState ?? null}</div>
        ) : (
          <table className="w-full min-w-[640px] table-fixed border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                {columns.map((col) => (
                  <th key={col.key} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-600">
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        className="flex items-center gap-1 hover:text-slate-900"
                      >
                        {col.label}
                        {sortKey === col.key ? (
                          sortDir === "asc" ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )
                        ) : null}
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => {
                const href = getRowHref?.(row);
                const rowKey = (row.id as string) ?? i;
                return (
                  <tr
                    key={rowKey}
                    className={`border-b border-slate-100 transition-colors hover:bg-slate-50/50 ${
                      onRowClick && !href ? "cursor-pointer" : ""
                    }`}
                    onClick={onRowClick && !href ? () => onRowClick(row) : undefined}
                    role={onRowClick && !href ? "button" : undefined}
                  >
                    {columns.map((col) => {
                      const value = row[col.key];
                      const cell = col.render ? col.render(row, value) : (value != null ? String(value) : "—");
                      const isFirstCol = col.key === columns[0].key;
                      return (
                        <td key={col.key} className="px-4 py-3 text-slate-700">
                          {href && isFirstCol ? (
                            <a
                              href={href}
                              className="font-medium text-[#3B82F6] hover:text-[#2563EB] hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {cell}
                            </a>
                          ) : (
                            cell
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
