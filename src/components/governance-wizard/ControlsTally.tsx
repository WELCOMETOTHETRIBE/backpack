"use client";

import type { ControlRecord } from "./GovernanceWizard";

const CONFIG_PREFIXES = ["3.1", "3.3", "3.4", "3.5", "3.13", "3.14"];
const GOVERNANCE_PREFIXES = ["3.2", "3.6", "3.7", "3.8", "3.9", "3.10", "3.11", "3.12"];

function isAdjudicated(r: ControlRecord): boolean {
  const s = r.implementationStatus;
  return s === "implemented" || s === "assessed" || s === "inherited";
}

function inBucket(controlId: string, prefixes: string[]): boolean {
  return prefixes.some((p) => controlId.startsWith(p));
}

export function ControlsTally({ records }: { records: ControlRecord[] }) {
  const total = records.length;
  const adjudicated = records.filter(isAdjudicated).length;
  const outstanding = total - adjudicated;
  const pct = total > 0 ? Math.round((adjudicated / total) * 100) : 0;

  const configRecords = records.filter((r) => inBucket(r.controlId, CONFIG_PREFIXES));
  const governanceRecords = records.filter((r) => inBucket(r.controlId, GOVERNANCE_PREFIXES));
  const inheritedRecords = records.filter((r) => r.implementationStatus === "inherited");
  const partialRecords = records.filter((r) => r.implementationStatus === "in_progress");

  const configAdj = configRecords.filter(isAdjudicated).length;
  const governanceAdj = governanceRecords.filter(isAdjudicated).length;
  const inheritedAdj = inheritedRecords.length;
  const partialTotal = partialRecords.length;
  const naTotal = 0;

  const buckets = [
    { label: "Configuration Controls", adjudicated: configAdj, total: configRecords.length },
    { label: "Governance Controls", adjudicated: governanceAdj, total: governanceRecords.length },
    { label: "Inherited", adjudicated: inheritedAdj, total: inheritedRecords.length },
    { label: "Partial (in progress)", adjudicated: 0, total: partialTotal },
    { label: "N/A (documented)", adjudicated: naTotal, total: naTotal },
  ];

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/95 p-6 text-white shadow-lg">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wider text-slate-400">
            NIST SP 800-171 Rev 2 — Closeout
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Adjudicated: <span className="text-blue-400">{adjudicated}/{total}</span>
            <span className="ml-2 text-xl font-normal text-slate-400">({pct}%)</span>
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Outstanding: <span className="font-semibold text-amber-400">{outstanding}</span>
          </p>
        </div>
      </div>

      <div className="mb-4">
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
          Closeout by bucket (adjudicated/total)
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
          {buckets.map((b) => (
            <span key={b.label} className="text-slate-300">
              <span className={b.adjudicated === b.total && b.total > 0 ? "font-medium text-green-400" : "text-slate-300"}>
                {b.adjudicated}/{b.total}
              </span>
              {" "}
              <span className="text-slate-500">{b.label}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
