"use client";

import { useMemo, useState } from "react";
import { CONTROL_FAMILIES } from "./constants";
import type { ControlRecord, NistControl } from "./GovernanceWizard";

const STATUS_COLUMNS = [
  { key: "not_started", label: "Not Started" },
  { key: "in_progress", label: "In Progress" },
  { key: "implemented", label: "Implemented" },
  { key: "inherited", label: "Inherited" },
] as const;

function normalizeStatus(status: string): (typeof STATUS_COLUMNS)[number]["key"] {
  if (status === "inherited") return "inherited";
  if (status === "in_progress") return "in_progress";
  if (status === "implemented" || status === "assessed") return "implemented";
  return "not_started";
}

export function ControlMatrix({
  records,
  nistControls,
  onSelectControl,
}: {
  records: ControlRecord[];
  nistControls: NistControl[];
  onSelectControl: (record: ControlRecord) => void;
}) {
  const [cellFocus, setCellFocus] = useState<{ familyCode: string; status: (typeof STATUS_COLUMNS)[number]["key"] } | null>(null);

  const nistByControlId = useMemo(
    () => Object.fromEntries(nistControls.map((n) => [n.controlId, n])),
    [nistControls]
  );

  const countsByFamilyAndStatus = useMemo(() => {
    const map = new Map<string, Record<(typeof STATUS_COLUMNS)[number]["key"], ControlRecord[]>>();
    for (const family of CONTROL_FAMILIES) {
      const prefix = family.controlPrefix;
      const inFamily = records.filter((r) => r.controlId.startsWith(prefix));
      const byStatus: Record<(typeof STATUS_COLUMNS)[number]["key"], ControlRecord[]> = {
        not_started: [],
        in_progress: [],
        implemented: [],
        inherited: [],
      };
      for (const r of inFamily) {
        const status = normalizeStatus(r.implementationStatus);
        byStatus[status].push(r);
      }
      map.set(family.code, byStatus);
    }
    return map;
  }, [records]);

  const focusedRecords =
    cellFocus && countsByFamilyAndStatus.has(cellFocus.familyCode)
      ? countsByFamilyAndStatus.get(cellFocus.familyCode)![cellFocus.status]
      : [];

  const statusCellClass = (colKey: string, count: number, isFocused: boolean) => {
    if (isFocused) return "bg-[#0F172A]/10 text-[#0F172A] ring-1 ring-[#0F172A]/30";
    if (count === 0) return "text-slate-400 cursor-default";
    const base = "hover:bg-slate-100 text-slate-800 font-medium";
    if (colKey === "implemented") return `${base} hover:bg-emerald-50`;
    if (colKey === "in_progress") return `${base} hover:bg-amber-50`;
    if (colKey === "inherited") return `${base} hover:bg-slate-100`;
    return base;
  };

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.05)]">
        <table className="w-full min-w-[640px] table-fixed border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80">
              <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Control family
              </th>
              {STATUS_COLUMNS.map((col) => (
                <th key={col.key} className="px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CONTROL_FAMILIES.map((family) => {
              const byStatus = countsByFamilyAndStatus.get(family.code)!;
              return (
                <tr key={family.code} className="border-b border-slate-100 transition-colors hover:bg-slate-50/50">
                  <td className="px-5 py-3 text-[14px] font-medium text-slate-900">
                    {family.code} — {family.plainName}
                  </td>
                  {STATUS_COLUMNS.map((col) => {
                    const list = byStatus[col.key];
                    const count = list.length;
                    const isFocused = cellFocus?.familyCode === family.code && cellFocus?.status === col.key;
                    return (
                      <td key={col.key} className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() =>
                            setCellFocus(count > 0 ? { familyCode: family.code, status: col.key } : null)
                          }
                          disabled={count === 0}
                          className={`w-full rounded-lg px-3 py-2.5 text-center text-[14px] transition-colors ${statusCellClass(col.key, count, isFocused)}`}
                        >
                          {count}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {cellFocus && focusedRecords.length > 0 && (
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_0_rgba(0,0,0,0.05)]">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              {CONTROL_FAMILIES.find((f) => f.code === cellFocus.familyCode)?.plainName} — {STATUS_COLUMNS.find((c) => c.key === cellFocus.status)?.label}
            </h3>
            <button
              type="button"
              onClick={() => setCellFocus(null)}
              className="text-[13px] font-medium text-slate-500 hover:text-slate-700"
            >
              Close
            </button>
          </div>
          <ul className="flex flex-wrap gap-2">
            {focusedRecords.map((record) => {
              const nist = nistByControlId[record.controlId];
              return (
                <li key={record.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCellFocus(null);
                      onSelectControl(record);
                    }}
                    className="rounded-lg border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-left text-[14px] transition-colors hover:border-[#0F172A]/30 hover:bg-[#0F172A]/5"
                  >
                    <span className="font-mono font-medium text-slate-800">{record.controlId}</span>
                    <span className="mt-0.5 block max-w-[220px] truncate text-[13px] text-slate-600">
                      {nist?.title ?? record.controlId}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
