"use client";

/**
 * SoD Pre-flight panel — fifth tab on SCTM 3.1.4 (AC.L2-3.1.4 Phase 3C).
 *
 * Lists provisioning decisions returned by /api/sod/provisioning-check —
 * the preventive control's evidence log. Every row is one pre-flight
 * call made by the EnclaveWatch admin wrapper (or manual API call)
 * before an Add-ADGroupMember commit. A `deny` row is the
 * strongest-possible 3.1.4[b] evidence: matrix prevented a Prohibited
 * combination before it reached AD.
 *
 * Read-only view; no operator workflow (decisions are immutable events).
 */
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Wifi,
} from "lucide-react";

type Decision = "allow" | "allow_with_attestation" | "deny" | "fail_open";

interface DecisionRow {
  id: string;
  subjectPrincipal: string;
  targetGroup: string;
  existingGroups: string[];
  resultingRoleIds: string[];
  decision: Decision;
  conflictPairA: string | null;
  conflictPairB: string | null;
  reason: string | null;
  requestedByPrincipal: string | null;
  triggeredVia: string;
  requestId: string | null;
  createdAt: string;
}

interface ListResponse {
  items: DecisionRow[];
  count: number;
  counts: {
    total: number;
    allow: number;
    with_attestation: number;
    deny: number;
    fail_open: number;
  };
}

const FILTERS: { value: Decision | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "deny", label: "Denied" },
  { value: "allow_with_attestation", label: "With attestation" },
  { value: "allow", label: "Allowed" },
  { value: "fail_open", label: "Fail-open" },
];

export function SoDPreflightPanel() {
  const [items, setItems] = useState<DecisionRow[]>([]);
  const [counts, setCounts] = useState<ListResponse["counts"]>({
    total: 0,
    allow: 0,
    with_attestation: 0,
    deny: 0,
    fail_open: 0,
  });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Decision | "all">("all");

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    fetch(`/api/sod/provisioning-decisions?decision=${filter}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
          throw new Error(body.error ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<ListResponse>;
      })
      .then((body) => {
        setItems(body.items ?? []);
        setCounts(body.counts);
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "load failed"))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[var(--color-border)] bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-gray-500)] mb-1.5">
              Preventive-control decision log
            </h3>
            <p className="text-xs text-slate-600">
              One row per pre-flight call from the EnclaveWatch admin wrapper before any{" "}
              <span className="font-mono">Add-ADGroupMember</span> against a{" "}
              <span className="font-mono">MAC-Vault-*</span> group commits. A <strong>deny</strong>{" "}
              row is the strongest 3.1.4[b] evidence — the matrix prevented a Prohibited
              combination before it reached AD.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800">
                Allowed: <strong>{counts.allow}</strong>
              </span>
              <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-800">
                With attestation: <strong>{counts.with_attestation}</strong>
              </span>
              <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-800">
                Denied: <strong>{counts.deny}</strong>
              </span>
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">
                Fail-open: <strong>{counts.fail_open}</strong>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFilter(f.value)}
                  className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${
                    filter === f.value
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
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </section>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50/50 px-3 py-2 text-xs text-red-800">
          {err}
        </div>
      )}

      {!loading && items.length === 0 && !err && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
          <p className="mt-2 text-sm font-medium text-slate-700">
            No {filter === "all" ? "" : filter} decisions recorded yet.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Decisions populate when the EnclaveWatch admin wrapper calls{" "}
            <span className="font-mono">/api/sod/provisioning-check</span> before each
            <span className="font-mono"> Add-ADGroupMember</span>.
          </p>
        </div>
      )}

      {items.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Principal</th>
                <th className="px-3 py-2 text-left font-semibold">Target group</th>
                <th className="px-3 py-2 text-left font-semibold">Conflict pair</th>
                <th className="px-3 py-2 text-left font-semibold">Decision</th>
                <th className="px-3 py-2 text-left font-semibold">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((d) => (
                <DecisionRowView key={d.id} d={d} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DecisionRowView({ d }: { d: DecisionRow }) {
  return (
    <tr className="hover:bg-slate-50/60">
      <td className="px-3 py-2 font-mono text-xs text-slate-800">{d.subjectPrincipal}</td>
      <td className="px-3 py-2 font-mono text-xs text-slate-700">{d.targetGroup}</td>
      <td className="px-3 py-2 text-xs">
        {d.conflictPairA && d.conflictPairB ? (
          <span className="font-mono text-slate-900">
            {d.conflictPairA}
            <span className="mx-1 text-slate-400">×</span>
            {d.conflictPairB}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        <DecisionPill decision={d.decision} reason={d.reason ?? ""} />
      </td>
      <td className="px-3 py-2 text-[11px] text-slate-500">
        {new Date(d.createdAt).toISOString().replace("T", " ").slice(0, 16)} UTC
        <span className="ml-1.5 rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-600">
          {d.triggeredVia}
        </span>
      </td>
    </tr>
  );
}

function DecisionPill({ decision, reason }: { decision: Decision; reason: string }) {
  if (decision === "allow") {
    return (
      <span
        title={reason}
        className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
      >
        <ShieldCheck className="h-3 w-3" />
        Allowed
      </span>
    );
  }
  if (decision === "allow_with_attestation") {
    return (
      <span
        title={reason}
        className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-800"
      >
        <ShieldAlert className="h-3 w-3" />
        With attestation
      </span>
    );
  }
  if (decision === "fail_open") {
    return (
      <span
        title={reason}
        className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800"
      >
        <Wifi className="h-3 w-3" />
        Fail-open
      </span>
    );
  }
  return (
    <span
      title={reason}
      className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800"
    >
      <ShieldOff className="h-3 w-3" />
      Denied
    </span>
  );
}
