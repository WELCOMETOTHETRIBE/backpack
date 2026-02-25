"use client";

import { useMemo } from "react";
import { CONTROL_FAMILIES } from "./constants";
import type { ControlRecord } from "./GovernanceWizard";

const STATUS_COLUMNS = [
  { key: "not_started", label: "Not Started" },
  { key: "in_progress", label: "In Progress" },
  { key: "implemented", label: "Implemented" },
  { key: "inherited", label: "Inherited" },
] as const;

export type StatusKey = (typeof STATUS_COLUMNS)[number]["key"];

function normalizeStatus(status: string): StatusKey {
  if (status === "inherited") return "inherited";
  if (status === "in_progress") return "in_progress";
  if (status === "implemented" || status === "assessed") return "implemented";
  return "not_started";
}

export function ControlMatrix({
  records,
  onOpenGroup,
}: {
  records: ControlRecord[];
  /** Called when user clicks a cell with count > 0. Opens modal for first control in that group. */
  onOpenGroup: (familyCode: string, status: StatusKey) => void;
}) {
  const countsByFamilyAndStatus = useMemo(() => {
    const map = new Map<string, Record<StatusKey, ControlRecord[]>>();
    for (const family of CONTROL_FAMILIES) {
      const prefix = family.controlPrefix;
      const inFamily = records.filter((r) => r.controlId.startsWith(prefix));
      const byStatus: Record<StatusKey, ControlRecord[]> = {
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

  const statusCellClass = (colKey: string, count: number) => {
    if (count === 0) return "text-slate-400 cursor-default";
    const base = "hover:bg-slate-100 text-slate-800 font-medium";
    if (colKey === "implemented") return `${base} hover:bg-emerald-50`;
    if (colKey === "in_progress") return `${base} hover:bg-amber-50`;
    if (colKey === "inherited") return `${base} hover:bg-slate-100`;
    return base;
  };

  return (
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
                  return (
                    <td key={col.key} className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => count > 0 && onOpenGroup(family.code, col.key)}
                        disabled={count === 0}
                        className={`w-full rounded-lg px-3 py-2.5 text-center text-[14px] transition-colors ${statusCellClass(col.key, count)}`}
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
  );
}
