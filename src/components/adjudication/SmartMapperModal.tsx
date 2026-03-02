"use client";

import { useState, useEffect } from "react";
import { X, CheckCircle2, FileCheck } from "lucide-react";
import { PURE_GOV_CONTROL_IDS } from "@/lib/governance/seed-data";

const ADJUDICATED = ["implemented", "assessed", "inherited", "not_applicable"];

type ControlRecord = {
  id: string;
  controlId: string;
  implementationStatus: string;
  evidencePartial?: boolean;
  satisfiedByGovernance?: boolean;
};

export function SmartMapperModal({
  onClose,
  controlIdsMapped,
}: {
  onClose: () => void;
  /** Control IDs that received artifacts in this upload (for comparison). */
  controlIdsMapped: string[];
}) {
  const [records, setRecords] = useState<ControlRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/control-records")
      .then((r) => (r.ok ? r.json() : []))
      .then(setRecords)
      .finally(() => setLoading(false));
  }, []);

  const govSet = new Set(PURE_GOV_CONTROL_IDS);
  const governanceSatisfied = records.filter(
    (r) => govSet.has(r.controlId) && ADJUDICATED.includes(r.implementationStatus)
  ).length;
  const governanceTotal = PURE_GOV_CONTROL_IDS.length;

  const mappedSet = new Set(controlIdsMapped);
  const partialsAddressed = records.filter(
    (r) => mappedSet.has(r.controlId) && r.evidencePartial === true
  ).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="smart-mapper-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 id="smart-mapper-title" className="text-lg font-semibold text-slate-800">
            Mapping summary
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <div className="space-y-5">
              <p className="text-sm text-slate-600">
                Comparison of what was uploaded against what is now effectively mapped.
              </p>
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10">
                    <FileCheck className="h-5 w-5 text-[var(--color-primary)]" aria-hidden />
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">Governance controls</p>
                    <p className="text-2xl font-semibold text-slate-900 mt-0.5">
                      {governanceSatisfied} of {governanceTotal} satisfied
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Pure governance controls (policy/documentation) now implemented or assessed.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                    <CheckCircle2 className="h-5 w-5 text-amber-700" aria-hidden />
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">Hybrid partials addressed</p>
                    <p className="text-2xl font-semibold text-slate-900 mt-0.5">
                      {partialsAddressed}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Controls that needed governance docs and received them in this upload.
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2"
                >
                  Acknowledge
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
