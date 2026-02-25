"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  GOVERNANCE_18_CONTROL_IDS,
  GOVERNANCE_18_ANALYSIS,
} from "@/lib/compliance/governance-18-analysis";
import { StatusBadge } from "@/components/governance-wizard/StatusBadge";
import { ChevronRight, ArrowLeft } from "lucide-react";

type ControlRecord = {
  id: string;
  controlId: string;
  implementationStatus: string;
};

export default function Governance18ListPage() {
  const [records, setRecords] = useState<ControlRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/control-records");
      if (res.ok) {
        const list: ControlRecord[] = await res.json();
        setRecords(list);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const recordByControlId = Object.fromEntries(
    records.map((r) => [r.controlId, r])
  );

  return (
    <div className="min-h-0 space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/adjudication"
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Adjudication
        </Link>
      </div>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          18 Governance Controls
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Adjudicate by document: each control has its own page with document
          requirements and upload. Upload required documents to satisfy the
          control; status updates to Implemented when complete.
        </p>
      </div>

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-slate-200 bg-white p-8">
          <p className="text-sm text-slate-600">Loading…</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <ul className="divide-y divide-slate-100">
            {GOVERNANCE_18_CONTROL_IDS.map((controlId) => {
              const analysis = GOVERNANCE_18_ANALYSIS[controlId];
              const record = recordByControlId[controlId];
              const title = analysis?.title ?? controlId;
              return (
                <li key={controlId}>
                  <Link
                    href={`/dashboard/adjudication/governance/${controlId}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 transition-colors hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <span className="font-mono text-sm font-medium text-slate-800">
                        {controlId}
                      </span>
                      <span className="ml-2 text-sm text-slate-600">
                        {title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {record ? (
                        <StatusBadge status={record.implementationStatus} />
                      ) : (
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          —
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
