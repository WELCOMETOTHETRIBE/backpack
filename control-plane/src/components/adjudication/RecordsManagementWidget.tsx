"use client";

import { useState, useEffect, useCallback } from "react";
import { FileCheck, Upload, Circle } from "lucide-react";
import Link from "next/link";

const CADENCE_DAYS: Record<string, number> = {
  Monthly: 30,
  Quarterly: 90,
  Annual: 365,
};

/** Controls that require periodic manual records, attestations, or training uploads. */
const MANUAL_RECORDS_CONTROL_IDS = [
  "3.2.1", // Security Awareness Training
  "3.2.2", // Role-Based Training
  "3.2.3", // Insider Threat Training
  "3.3.2", // Audit Review & Analysis
  "3.12.1", // System Security Plan
  "3.14.1", // Flaw Remediation / IR plan
];

const TRAINING_CONTROL_IDS = ["3.2.1", "3.2.2", "3.2.3"];

type ControlRecordRow = {
  id: string;
  controlId: string;
  implementationStatus: string;
  lastValidationDate: string | null;
  monitoringCadence: string | null;
};

type NistRow = { controlId: string; title: string | null };

function nextDueDate(
  lastValidationDate: Date | null,
  monitoringCadence: string | null
): Date {
  if (!lastValidationDate || !monitoringCadence) return new Date(0);
  const days = CADENCE_DAYS[monitoringCadence] ?? 90;
  const next = new Date(lastValidationDate);
  next.setDate(next.getDate() + days);
  return next;
}

function healthStatus(
  lastValidationDate: Date | null,
  cadence: string | null
): "green" | "amber" | "red" {
  if (!lastValidationDate) return "red";
  const now = new Date();
  const daysSince = (now.getTime() - new Date(lastValidationDate).getTime()) / (24 * 60 * 60 * 1000);
  const daysCadence = cadence ? CADENCE_DAYS[cadence] ?? 90 : 90;
  if (daysSince <= 30) return "green";
  if (daysSince <= daysCadence) return "amber";
  return "red";
}

export function RecordsManagementWidget() {
  const [records, setRecords] = useState<ControlRecordRow[]>([]);
  const [nist, setNist] = useState<NistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [attestingId, setAttestingId] = useState<string | null>(null);
  const [attestComment, setAttestComment] = useState("");
  const [showAttestModal, setShowAttestModal] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [recRes, nistRes] = await Promise.all([
        fetch("/api/control-records"),
        fetch("/api/controls/nist"),
      ]);
      if (recRes.ok) {
        const list: ControlRecordRow[] = await recRes.json();
        setRecords(
          list.filter(
            (r) =>
              MANUAL_RECORDS_CONTROL_IDS.includes(r.controlId) ||
              r.monitoringCadence
          )
        );
      }
      if (nistRes.ok) setNist(await nistRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const nistByControlId = Object.fromEntries(nist.map((n) => [n.controlId, n]));

  async function submitAttestation(controlRecordId: string) {
    setAttestingId(controlRecordId);
    try {
      const res = await fetch("/api/attestations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attestationType: "control_attestation",
          resourceType: "control_record",
          resourceId: controlRecordId,
          comment: attestComment || undefined,
        }),
      });
      if (res.ok) {
        setShowAttestModal(null);
        setAttestComment("");
        fetchData();
      }
    } finally {
      setAttestingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-600">Loading…</p>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">
          Records Management
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          No manual-record controls configured. Set monitoring cadence on
          controls or ensure 3.2.1, 3.2.2, 3.2.3, 3.3.2, 3.12.1, 3.14.1 exist.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">
          Records Management
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Manual attestations and training records. Attest to refresh health.
        </p>
      </div>
      <div className="divide-y divide-slate-100">
        {records.map((record) => {
          const lastVal = record.lastValidationDate
            ? new Date(record.lastValidationDate)
            : null;
          const cadence = record.monitoringCadence ?? "Quarterly";
          const nextDue = nextDueDate(lastVal, cadence);
          const health = healthStatus(lastVal, cadence);
          const isOverdue = nextDue.getTime() < Date.now();
          const isTraining = TRAINING_CONTROL_IDS.includes(record.controlId);
          const title =
            nistByControlId[record.controlId]?.title ?? record.controlId;

          return (
            <div
              key={record.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-mono text-sm font-medium text-slate-800">
                  {record.controlId}
                </p>
                <p className="truncate text-xs text-slate-600">{title}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1 text-xs"
                    title={
                      lastVal
                        ? `Last validated ${lastVal.toLocaleDateString()}`
                        : "Never validated"
                    }
                  >
                    <Circle
                      className={`h-2 w-2 ${
                        health === "green"
                          ? "fill-green-500 text-green-500"
                          : health === "amber"
                            ? "fill-amber-500 text-amber-500"
                            : "fill-red-500 text-red-500"
                      }`}
                    />
                    {lastVal
                      ? `Last: ${lastVal.toLocaleDateString()}`
                      : "Not yet attested"}
                  </span>
                  <span
                    className={`text-xs ${
                      isOverdue ? "font-medium text-red-600" : "text-slate-500"
                    }`}
                  >
                    Next due:{" "}
                    {nextDue.getTime() > 0
                      ? nextDue.toLocaleDateString()
                      : "Overdue"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isTraining && (
                  <Link
                    href={`/dashboard/controls?highlight=${record.controlId}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Upload cert
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => setShowAttestModal(record.id)}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#0F172A] px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                >
                  <FileCheck className="h-3.5 w-3.5" />
                  Attest
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showAttestModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-800">
              Confirm attestation
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              I have reviewed the logs/records for this period.
            </p>
            <textarea
              value={attestComment}
              onChange={(e) => setAttestComment(e.target.value)}
              placeholder="Optional comment…"
              rows={2}
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAttestModal(null);
                  setAttestComment("");
                }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => submitAttestation(showAttestModal)}
                disabled={attestingId !== null}
                className="rounded-lg bg-[#0F172A] px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {attestingId ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
