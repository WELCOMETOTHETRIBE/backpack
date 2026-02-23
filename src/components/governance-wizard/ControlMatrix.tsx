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

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[640px] table-fixed border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-3 font-semibold text-gray-900">Control family</th>
              {STATUS_COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 font-semibold text-gray-700"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CONTROL_FAMILIES.map((family) => {
              const byStatus = countsByFamilyAndStatus.get(family.code)!;
              return (
                <tr
                  key={family.code}
                  className="border-b border-gray-100 hover:bg-gray-50/50"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {family.code} — {family.plainName}
                  </td>
                  {STATUS_COLUMNS.map((col) => {
                    const list = byStatus[col.key];
                    const count = list.length;
                    const isFocused =
                      cellFocus?.familyCode === family.code && cellFocus?.status === col.key;
                    return (
                      <td key={col.key} className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() =>
                            setCellFocus(
                              count > 0
                                ? { familyCode: family.code, status: col.key }
                                : null
                            )
                          }
                          className={`w-full rounded-md px-3 py-2 text-center font-medium transition-colors ${
                            isFocused
                              ? "bg-blue-100 text-blue-900 ring-1 ring-blue-300"
                              : count > 0
                                ? "hover:bg-gray-100 text-gray-900"
                                : "text-gray-400"
                          }`}
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
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">
            {CONTROL_FAMILIES.find((f) => f.code === cellFocus.familyCode)?.plainName} — {STATUS_COLUMNS.find((c) => c.key === cellFocus.status)?.label}
          </h3>
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
                    className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left text-sm font-mono text-gray-800 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-900"
                  >
                    <span className="font-medium">{record.controlId}</span>
                    <span className="ml-2 block truncate max-w-[240px] text-gray-600">
                      {nist?.title ?? record.controlId}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={() => setCellFocus(null)}
            className="mt-3 text-sm text-gray-500 hover:text-gray-700"
          >
            Close list
          </button>
        </div>
      )}
    </div>
  );
}
