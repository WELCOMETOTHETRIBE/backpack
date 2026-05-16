"use client";

/**
 * SoD Findings panel — operator view of the detective-scan output for
 * AC.L2-3.1.4.
 *
 * Renders as a second tab on the SCTM 3.1.4 detail page. Lists findings
 * filtered by status, surfaces the principal / conflict pair / severity
 * up-front, and exposes a disposition workflow (justify / mark
 * remediated / accept risk) for open findings. Backed by
 * /api/sod/findings (list) and /api/sod/findings/[id] (disposition).
 */
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  ShieldAlert,
  ShieldOff,
  X,
} from "lucide-react";
import { getSodRole, getCompensatingControlsFor } from "@/lib/compliance/sod-matrix";

type FindingStatus = "open" | "remediated" | "justified" | "accepted_risk";

interface Finding {
  id: string;
  subjectPrincipal: string;
  roleIds: string[];
  pairRoleA: string;
  pairRoleB: string;
  dispositionType: "P" | "C_no_attestation";
  severity: "high" | "medium";
  status: FindingStatus;
  openedAt: string;
  closedAt: string | null;
  justificationText: string | null;
  sourceScanRunId: string;
}

const STATUS_FILTERS: { value: "open" | "all" | FindingStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "justified", label: "Justified" },
  { value: "remediated", label: "Remediated" },
  { value: "accepted_risk", label: "Accepted risk" },
  { value: "all", label: "All" },
];

export function SoDFindingsPanel() {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"open" | "all" | FindingStatus>("open");
  const [active, setActive] = useState<Finding | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/sod/findings?status=${statusFilter}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((body: { findings: Finding[] }) => setFindings(body.findings ?? []))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "load failed"))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[var(--color-border)] bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-gray-500)] mb-1.5">
              Detective scan findings
            </h3>
            <p className="text-xs text-slate-600">
              Conflict-pair findings opened by the SoD detective scan. Each row is one
              identity holding one prohibited or unsupported-compensating role pair from
              MAC-SOP-235.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setStatusFilter(f.value)}
                  className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${
                    statusFilter === f.value
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
              title="Reload"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50/50 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      )}

      {!loading && findings.length === 0 && !error && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
          <p className="mt-2 text-sm font-medium text-slate-700">
            No {statusFilter === "open" ? "open" : statusFilter} findings.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {statusFilter === "open"
              ? "Either no detective scan has run yet, or every flagged conflict has been disposed."
              : "Switch the filter to see findings in other states."}
          </p>
        </div>
      )}

      {findings.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Principal</th>
                <th className="px-3 py-2 text-left font-semibold">Conflict pair</th>
                <th className="px-3 py-2 text-left font-semibold">Severity</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <th className="px-3 py-2 text-left font-semibold">Opened</th>
                <th className="px-3 py-2 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {findings.map((f) => (
                <FindingRow key={f.id} f={f} onSelect={() => setActive(f)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {active && (
        <FindingDetailModal
          finding={active}
          onClose={() => setActive(null)}
          onDisposed={() => {
            setActive(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function FindingRow({ f, onSelect }: { f: Finding; onSelect: () => void }) {
  const roleA = getSodRole(f.pairRoleA);
  const roleB = getSodRole(f.pairRoleB);
  return (
    <tr className="hover:bg-slate-50/60">
      <td className="px-3 py-2 font-mono text-xs text-slate-800">{f.subjectPrincipal}</td>
      <td className="px-3 py-2 text-xs">
        <span className="font-mono font-semibold text-slate-900">{f.pairRoleA}</span>
        <span className="mx-1 text-slate-400">×</span>
        <span className="font-mono font-semibold text-slate-900">{f.pairRoleB}</span>
        <span className="ml-1.5 text-slate-500">
          ({roleA?.code ?? f.pairRoleA} / {roleB?.code ?? f.pairRoleB})
        </span>
      </td>
      <td className="px-3 py-2">
        <SeverityPill severity={f.severity} dispositionType={f.dispositionType} />
      </td>
      <td className="px-3 py-2">
        <StatusPill status={f.status} />
      </td>
      <td className="px-3 py-2 text-[11px] text-slate-500">
        {new Date(f.openedAt).toISOString().slice(0, 10)}
      </td>
      <td className="px-3 py-2 text-right">
        <button
          type="button"
          onClick={onSelect}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
        >
          {f.status === "open" ? "Review" : "Details"}
        </button>
      </td>
    </tr>
  );
}

function SeverityPill({
  severity,
  dispositionType,
}: {
  severity: Finding["severity"];
  dispositionType: Finding["dispositionType"];
}) {
  if (severity === "high") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800">
        <ShieldOff className="h-3 w-3" />
        High (P)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
      <ShieldAlert className="h-3 w-3" />
      Medium ({dispositionType === "C_no_attestation" ? "C, no attestation" : "C"})
    </span>
  );
}

function StatusPill({ status }: { status: FindingStatus }) {
  if (status === "open") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
        <AlertTriangle className="h-3 w-3" />
        Open
      </span>
    );
  }
  if (status === "remediated") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
        <CheckCircle2 className="h-3 w-3" />
        Remediated
      </span>
    );
  }
  if (status === "justified") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-800">
        <Clock className="h-3 w-3" />
        Justified
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800">
      <AlertTriangle className="h-3 w-3" />
      Accepted risk
    </span>
  );
}

function FindingDetailModal({
  finding,
  onClose,
  onDisposed,
}: {
  finding: Finding;
  onClose: () => void;
  onDisposed: () => void;
}) {
  const roleA = getSodRole(finding.pairRoleA);
  const roleB = getSodRole(finding.pairRoleB);
  const compensating =
    finding.dispositionType === "C_no_attestation"
      ? getCompensatingControlsFor(finding.pairRoleA, finding.pairRoleB)
      : null;

  const [justification, setJustification] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dispose = (status: "remediated" | "justified" | "accepted_risk") => {
    if ((status === "justified" || status === "accepted_risk") && justification.trim().length === 0) {
      setErr("Justification required for this disposition.");
      return;
    }
    setSubmitting(true);
    setErr(null);
    fetch(`/api/sod/findings/${finding.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, justification: justification.trim() || undefined }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
          throw new Error(body.error ?? `HTTP ${r.status}`);
        }
        onDisposed();
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "request failed"))
      .finally(() => setSubmitting(false));
  };

  const isOpen = finding.status === "open";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-200 p-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">SoD finding</h3>
            <p className="mt-0.5 font-mono text-xs text-slate-500">{finding.id}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="font-semibold text-slate-500">Principal</dt>
            <dd className="font-mono text-slate-900">{finding.subjectPrincipal}</dd>
            <dt className="font-semibold text-slate-500">Conflict pair</dt>
            <dd className="text-slate-900">
              <span className="font-mono font-semibold">{finding.pairRoleA}</span>
              {roleA ? ` (${roleA.code} — ${roleA.name})` : ""}
              <br />
              <span className="font-mono font-semibold">{finding.pairRoleB}</span>
              {roleB ? ` (${roleB.code} — ${roleB.name})` : ""}
            </dd>
            <dt className="font-semibold text-slate-500">Full role set</dt>
            <dd className="font-mono text-slate-700">{finding.roleIds.join(", ")}</dd>
            <dt className="font-semibold text-slate-500">Severity</dt>
            <dd>
              <SeverityPill severity={finding.severity} dispositionType={finding.dispositionType} />
            </dd>
            <dt className="font-semibold text-slate-500">Status</dt>
            <dd>
              <StatusPill status={finding.status} />
            </dd>
            <dt className="font-semibold text-slate-500">Opened</dt>
            <dd className="text-slate-700">{new Date(finding.openedAt).toISOString().replace("T", " ").slice(0, 16)} UTC</dd>
            {finding.closedAt && (
              <>
                <dt className="font-semibold text-slate-500">Closed</dt>
                <dd className="text-slate-700">{new Date(finding.closedAt).toISOString().replace("T", " ").slice(0, 16)} UTC</dd>
              </>
            )}
            <dt className="font-semibold text-slate-500">Scan run</dt>
            <dd className="font-mono text-xs text-slate-500">{finding.sourceScanRunId.slice(0, 8)}…</dd>
          </dl>

          {compensating && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-xs">
              <p className="mb-1 font-semibold text-amber-900">
                Compensating controls required ({compensating.label})
              </p>
              <ul className="list-disc space-y-0.5 pl-5 text-amber-900">
                {compensating.controls.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
              <p className="mt-2 text-amber-700">
                If these controls are in place for this identity, dispose this finding as
                <strong> Justified</strong> with a pointer to the attestation record.
              </p>
            </div>
          )}

          {finding.justificationText && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs">
              <p className="mb-1 font-semibold text-slate-700">Justification on file</p>
              <p className="whitespace-pre-wrap text-slate-700">{finding.justificationText}</p>
            </div>
          )}

          {isOpen && (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
              <label className="block text-xs font-semibold text-slate-700">
                Justification / remediation note
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  rows={3}
                  placeholder="Required for Justified or Accepted-risk. Optional for Remediated."
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </label>
              {err && <p className="text-xs text-red-700">{err}</p>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => dispose("remediated")}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Mark remediated
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => dispose("justified")}
                  className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Clock className="h-4 w-4" />
                  Justify (keep open in audit)
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => dispose("accepted_risk")}
                  className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-50"
                >
                  <AlertTriangle className="h-4 w-4" />
                  Accept risk
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
