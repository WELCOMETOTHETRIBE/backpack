"use client";

/**
 * SoD Attestation panel — Phase 2C of AC.L2-3.1.4.
 *
 * Third tab on SCTM 3.1.4. Shows the most recent quarterly attestation,
 * a freshness indicator (days since last / overdue if >90), and a sign
 * form that lists open C-cell findings as checkboxes — the operator
 * selects which identities they want to cover, optionally adds notes,
 * and signs. The submit auto-closes the selected open C-findings as
 * `justified` with the attestation entry id as the closure reference.
 *
 * Backed by /api/sod/attestations (GET list + POST sign) and
 * /api/sod/findings (list of open C-findings).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  FileSignature,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

interface AttestationRow {
  id: string;
  reviewer: string | null;
  reviewedAt: string | null;
  reviewPeriodStart: string | null;
  reviewPeriodEnd: string | null;
  result: string | null;
  attestedPrincipals: string[];
  notes: string | null;
  finalizedAt: string | null;
  createdAt: string;
}

interface AttestationListResponse {
  attestations: AttestationRow[];
  last_attestation_at: string | null;
  days_since_last: number | null;
  cadence_target_days: number;
}

interface FindingLite {
  id: string;
  subjectPrincipal: string;
  pairRoleA: string;
  pairRoleB: string;
  dispositionType: "P" | "C_no_attestation";
  status: string;
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function quarterStartYmd(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 90);
  return d.toISOString().slice(0, 10);
}

export function SoDAttestationPanel() {
  const [attestations, setAttestations] = useState<AttestationRow[]>([]);
  const [daysSince, setDaysSince] = useState<number | null>(null);
  const [cadenceTarget, setCadenceTarget] = useState<number>(90);
  const [openCFindings, setOpenCFindings] = useState<FindingLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Sign-form state
  const [periodStart, setPeriodStart] = useState(quarterStartYmd());
  const [periodEnd, setPeriodEnd] = useState(todayYmd());
  const [selectedPrincipals, setSelectedPrincipals] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<"no_change" | "exceptions_present">("no_change");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    Promise.all([
      fetch(`/api/sod/attestations`, { credentials: "include" }).then((r) => {
        if (!r.ok) throw new Error(`attestations HTTP ${r.status}`);
        return r.json() as Promise<AttestationListResponse>;
      }),
      fetch(`/api/sod/findings?status=open`, { credentials: "include" }).then((r) => {
        if (!r.ok) throw new Error(`findings HTTP ${r.status}`);
        return r.json() as Promise<{ findings: FindingLite[] }>;
      }),
    ])
      .then(([attestResp, findResp]) => {
        setAttestations(attestResp.attestations);
        setDaysSince(attestResp.days_since_last);
        setCadenceTarget(attestResp.cadence_target_days);
        setOpenCFindings(
          findResp.findings.filter((f) => f.dispositionType === "C_no_attestation"),
        );
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "load failed"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const uniquePrincipals = useMemo(() => {
    const set = new Set<string>();
    for (const f of openCFindings) set.add(f.subjectPrincipal);
    return [...set].sort();
  }, [openCFindings]);

  const toggleAll = () => {
    if (selectedPrincipals.size === uniquePrincipals.length) {
      setSelectedPrincipals(new Set());
    } else {
      setSelectedPrincipals(new Set(uniquePrincipals));
    }
  };

  const togglePrincipal = (p: string) => {
    const next = new Set(selectedPrincipals);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setSelectedPrincipals(next);
  };

  const submit = () => {
    setSubmitting(true);
    setSubmitErr(null);
    setSubmitOk(null);
    fetch(`/api/sod/attestations`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        review_period_start: periodStart,
        review_period_end: periodEnd,
        attested_principals: [...selectedPrincipals],
        result,
        notes: notes.trim() || undefined,
      }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
          throw new Error(body.error ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<{ entry_id: string; auto_closed_count: number }>;
      })
      .then((body) => {
        setSubmitOk(
          `Attestation signed. Auto-closed ${body.auto_closed_count} open C-finding${
            body.auto_closed_count === 1 ? "" : "s"
          }.`,
        );
        setSelectedPrincipals(new Set());
        setNotes("");
        load();
      })
      .catch((e: unknown) => setSubmitErr(e instanceof Error ? e.message : "submit failed"))
      .finally(() => setSubmitting(false));
  };

  const overdue = daysSince !== null && daysSince > cadenceTarget;
  const dueSoon = daysSince !== null && daysSince >= cadenceTarget - 14 && !overdue;
  const fresh = daysSince !== null && daysSince < cadenceTarget - 14;

  return (
    <div className="space-y-4">
      {/* Freshness header */}
      <section className="rounded-xl border border-[var(--color-border)] bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-gray-500)] mb-1.5">
              Quarterly attestation cadence
            </h3>
            {daysSince === null && (
              <p className="text-sm text-slate-700">
                No quarterly attestation on file. Sign one below to start the cadence.
              </p>
            )}
            {daysSince !== null && (
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-semibold text-slate-900">{daysSince}</span>
                <span className="text-sm text-slate-600">
                  day{daysSince === 1 ? "" : "s"} since last attestation
                </span>
                {overdue && (
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
                    OVERDUE
                  </span>
                )}
                {dueSoon && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                    Due soon
                  </span>
                )}
                {fresh && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                    Current
                  </span>
                )}
              </div>
            )}
            <p className="mt-1 text-xs text-slate-500">
              Target cadence: every {cadenceTarget} days. Attesting a principal closes its open
              Compensating-cell findings (medium severity) as Justified.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </section>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50/50 px-3 py-2 text-xs text-red-800">
          {err}
        </div>
      )}

      {/* Sign form */}
      <section className="rounded-xl border border-[var(--color-border)] bg-white p-4">
        <h3 className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-gray-500)]">
          <FileSignature className="h-3 w-3" />
          Sign a new quarterly attestation
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            <span className="block font-semibold text-slate-700">Review period start</span>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>
          <label className="text-xs">
            <span className="block font-semibold text-slate-700">Review period end</span>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>
        </div>

        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="block text-xs font-semibold text-slate-700">
              Identities with open Compensating-cell findings ({uniquePrincipals.length})
            </span>
            {uniquePrincipals.length > 0 && (
              <button
                type="button"
                onClick={toggleAll}
                className="text-[11px] text-blue-600 hover:underline"
              >
                {selectedPrincipals.size === uniquePrincipals.length ? "Clear all" : "Select all"}
              </button>
            )}
          </div>
          {uniquePrincipals.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">
              No open C-cell findings. You can still sign an attestation with no covered identities
              — it records the periodic review with no exceptions.
            </p>
          ) : (
            <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200">
              {uniquePrincipals.map((p) => {
                const findingsForP = openCFindings.filter((f) => f.subjectPrincipal === p);
                return (
                  <label
                    key={p}
                    className="flex cursor-pointer items-start gap-2 border-b border-slate-100 px-2.5 py-1.5 text-xs hover:bg-slate-50 last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPrincipals.has(p)}
                      onChange={() => togglePrincipal(p)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="font-mono font-semibold text-slate-900">{p}</span>
                      <span className="ml-2 text-slate-500">
                        {findingsForP.length} pair{findingsForP.length === 1 ? "" : "s"}:{" "}
                        {findingsForP
                          .map((f) => `${f.pairRoleA}×${f.pairRoleB}`)
                          .join(", ")}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr]">
          <label className="text-xs">
            <span className="block font-semibold text-slate-700">Result</span>
            <select
              value={result}
              onChange={(e) => setResult(e.target.value as "no_change" | "exceptions_present")}
              className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="no_change">No change</option>
              <option value="exceptions_present">Exceptions present</option>
            </select>
          </label>
          <label className="text-xs">
            <span className="block font-semibold text-slate-700">Notes (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Reference compensating-control evidence; note any exceptions; etc."
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>
        </div>

        {submitErr && <p className="mt-2 text-xs text-red-700">{submitErr}</p>}
        {submitOk && <p className="mt-2 text-xs text-emerald-700">{submitOk}</p>}

        <button
          type="button"
          disabled={submitting}
          onClick={submit}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
        >
          <FileSignature className="h-4 w-4" />
          {submitting ? "Signing…" : "Sign quarterly attestation"}
        </button>
      </section>

      {/* Recent attestations */}
      <section className="rounded-xl border border-[var(--color-border)] bg-white p-4">
        <h3 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-[var(--color-gray-500)]">
          Recent attestations
        </h3>
        {attestations.length === 0 ? (
          <p className="text-xs text-slate-500">No attestations on file yet.</p>
        ) : (
          <div className="space-y-2">
            {attestations.map((a) => (
              <AttestationCard key={a.id} a={a} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AttestationCard({ a }: { a: AttestationRow }) {
  const finalized = a.finalizedAt ? new Date(a.finalizedAt) : null;
  const resultLabel = a.result === "no_change" ? "No change" : a.result === "exceptions_present" ? "Exceptions present" : a.result ?? "—";
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3 text-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono font-semibold text-slate-900">
            {a.reviewedAt ?? a.createdAt.slice(0, 10)}
          </span>
          <span className="text-slate-600">
            {a.reviewer ?? "(unknown reviewer)"}
          </span>
          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
            {resultLabel}
          </span>
          {a.attestedPrincipals.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
              <CheckCircle2 className="h-3 w-3" />
              {a.attestedPrincipals.length} principal
              {a.attestedPrincipals.length === 1 ? "" : "s"} attested
            </span>
          )}
          {a.attestedPrincipals.length === 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
              <ShieldAlert className="h-3 w-3" />
              No covered principals
            </span>
          )}
        </div>
        {finalized && (
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
            <Clock className="h-3 w-3" />
            {finalized.toISOString().replace("T", " ").slice(0, 16)} UTC
          </span>
        )}
      </div>
      {a.reviewPeriodStart && a.reviewPeriodEnd && (
        <p className="mt-1 text-[11px] text-slate-500">
          Period: {a.reviewPeriodStart} → {a.reviewPeriodEnd}
        </p>
      )}
      {a.attestedPrincipals.length > 0 && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[11px] font-medium text-slate-600 hover:text-slate-900">
            Show attested principals
          </summary>
          <ul className="mt-1 list-disc pl-5 font-mono text-[11px] text-slate-700">
            {a.attestedPrincipals.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </details>
      )}
      {a.notes && (
        <p className="mt-1.5 whitespace-pre-wrap text-[11px] text-slate-700">{a.notes}</p>
      )}
    </div>
  );
}
