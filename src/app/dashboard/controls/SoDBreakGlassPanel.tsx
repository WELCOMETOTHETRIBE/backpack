"use client";

/**
 * SoD R10 break-glass panel — fourth tab on SCTM 3.1.4 (AC.L2-3.1.4
 * Phase 3A).
 *
 * Lists Entra PIM activations of the R10 (Incident Responder) role
 * captured by the EnclaveWatch collector. Each activation needs a
 * post-hoc review by a non-activator within 24h. The review modal
 * blocks self-review at the API layer — the literal AC.L2-3.1.4
 * enforcement on the very break-glass review.
 *
 * Backed by /api/sod/r10-break-glass (list) and
 * /api/sod/r10-break-glass/[id] (review).
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

type DerivedStatus = "pending_review" | "reviewed" | "overdue" | "void";

interface Activation {
  id: string;
  externalActivationId: string;
  activatorPrincipal: string;
  activatedRole: string;
  activationStartedAt: string;
  activationEndsAt: string | null;
  activationReason: string | null;
  pimApproverPrincipal: string | null;
  mfaClaim: string | null;
  status: "pending_review" | "reviewed" | "void";
  reviewedAt: string | null;
  reviewedById: string | null;
  reviewNotes: string | null;
  derivedStatus: DerivedStatus;
  sla_window_hours: number;
}

interface ListResponse {
  items: Activation[];
  count: number;
  pending_total: number;
}

const STATUS_FILTERS: { value: "pending_review" | "reviewed" | "overdue" | "all"; label: string }[] = [
  { value: "pending_review", label: "Pending review" },
  { value: "overdue", label: "Overdue" },
  { value: "reviewed", label: "Reviewed" },
  { value: "all", label: "All" },
];

function hoursSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 3600000));
}

export function SoDBreakGlassPanel() {
  const [items, setItems] = useState<Activation[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_FILTERS)[number]["value"]>("pending_review");
  const [active, setActive] = useState<Activation | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    fetch(`/api/sod/r10-break-glass?status=${statusFilter}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
          throw new Error(body.error ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<ListResponse>;
      })
      .then((body) => {
        setItems(body.items ?? []);
        setPendingTotal(body.pending_total ?? 0);
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "load failed"))
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
              R10 incident-responder break-glass
            </h3>
            <p className="text-xs text-slate-600">
              Entra PIM activations of <span className="font-mono">MAC-Vault-IR</span> (R10).
              Each activation requires a post-hoc review by a non-activator within 24h
              per MAC-SOP-235 §5.3. Self-review is blocked at the API layer.
            </p>
            {pendingTotal > 0 && (
              <p className="mt-2">
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                  {pendingTotal} pending review
                </span>
              </p>
            )}
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
            No {statusFilter === "pending_review" ? "pending" : statusFilter} activations.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            EnclaveWatch posts PIM activations of MAC-Vault-IR on a cadence. If you expect
            activations and see none here, verify the EnclaveWatch break-glass collector
            is registered as a scheduled task.
          </p>
        </div>
      )}

      {items.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Activator</th>
                <th className="px-3 py-2 text-left font-semibold">Role</th>
                <th className="px-3 py-2 text-left font-semibold">Started</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <th className="px-3 py-2 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((a) => (
                <ActivationRow key={a.id} a={a} onSelect={() => setActive(a)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {active && (
        <ActivationModal
          activation={active}
          onClose={() => setActive(null)}
          onReviewed={() => {
            setActive(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function ActivationRow({
  a,
  onSelect,
}: {
  a: Activation;
  onSelect: () => void;
}) {
  return (
    <tr className="hover:bg-slate-50/60">
      <td className="px-3 py-2 font-mono text-xs text-slate-800">{a.activatorPrincipal}</td>
      <td className="px-3 py-2 font-mono text-xs text-slate-700">{a.activatedRole}</td>
      <td className="px-3 py-2 text-[11px] text-slate-500">
        {new Date(a.activationStartedAt).toISOString().replace("T", " ").slice(0, 16)} UTC
        <span className="ml-2 text-slate-400">
          ({hoursSince(a.activationStartedAt)}h ago)
        </span>
      </td>
      <td className="px-3 py-2">
        <StatusPill derivedStatus={a.derivedStatus} />
      </td>
      <td className="px-3 py-2 text-right">
        <button
          type="button"
          onClick={onSelect}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
        >
          {a.status === "pending_review" ? "Review" : "Details"}
        </button>
      </td>
    </tr>
  );
}

function StatusPill({ derivedStatus }: { derivedStatus: DerivedStatus }) {
  if (derivedStatus === "reviewed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
        <CheckCircle2 className="h-3 w-3" />
        Reviewed
      </span>
    );
  }
  if (derivedStatus === "overdue") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800">
        <AlertTriangle className="h-3 w-3" />
        Overdue
      </span>
    );
  }
  if (derivedStatus === "void") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
        <ShieldOff className="h-3 w-3" />
        Void
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
      <Clock className="h-3 w-3" />
      Pending review
    </span>
  );
}

function ActivationModal({
  activation: a,
  onClose,
  onReviewed,
}: {
  activation: Activation;
  onClose: () => void;
  onReviewed: () => void;
}) {
  const [notes, setNotes] = useState(a.reviewNotes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isPending = a.status === "pending_review";
  const isOverdue = a.derivedStatus === "overdue";

  const submit = () => {
    if (notes.trim().length === 0) {
      setErr("Review notes required.");
      return;
    }
    setSubmitting(true);
    setErr(null);
    fetch(`/api/sod/r10-break-glass/${a.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ review_notes: notes.trim() }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
          throw new Error(body.error ?? `HTTP ${r.status}`);
        }
        onReviewed();
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "submit failed"))
      .finally(() => setSubmitting(false));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-200 p-4">
          <div>
            <h3 className="flex items-center gap-1.5 text-base font-semibold text-slate-900">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              R10 break-glass activation
            </h3>
            <p className="mt-0.5 font-mono text-xs text-slate-500">{a.id}</p>
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
            <dt className="font-semibold text-slate-500">Activator</dt>
            <dd className="font-mono text-slate-900">{a.activatorPrincipal}</dd>
            <dt className="font-semibold text-slate-500">Role activated</dt>
            <dd className="font-mono text-slate-900">{a.activatedRole}</dd>
            <dt className="font-semibold text-slate-500">Started</dt>
            <dd className="text-slate-700">
              {new Date(a.activationStartedAt).toISOString().replace("T", " ").slice(0, 19)} UTC
            </dd>
            {a.activationEndsAt && (
              <>
                <dt className="font-semibold text-slate-500">Expires</dt>
                <dd className="text-slate-700">
                  {new Date(a.activationEndsAt).toISOString().replace("T", " ").slice(0, 19)} UTC
                </dd>
              </>
            )}
            <dt className="font-semibold text-slate-500">Status</dt>
            <dd>
              <StatusPill derivedStatus={a.derivedStatus} />
            </dd>
            {a.activationReason && (
              <>
                <dt className="font-semibold text-slate-500">Activation reason</dt>
                <dd className="whitespace-pre-wrap text-slate-700">{a.activationReason}</dd>
              </>
            )}
            {a.pimApproverPrincipal && (
              <>
                <dt className="font-semibold text-slate-500">PIM approver</dt>
                <dd className="font-mono text-slate-700">{a.pimApproverPrincipal}</dd>
              </>
            )}
            {a.mfaClaim && (
              <>
                <dt className="font-semibold text-slate-500">MFA claim</dt>
                <dd className="font-mono text-slate-700">{a.mfaClaim}</dd>
              </>
            )}
            <dt className="font-semibold text-slate-500">Source ref</dt>
            <dd className="font-mono text-[11px] text-slate-500">{a.externalActivationId}</dd>
            {a.reviewedAt && (
              <>
                <dt className="font-semibold text-slate-500">Reviewed at</dt>
                <dd className="text-slate-700">
                  {new Date(a.reviewedAt).toISOString().replace("T", " ").slice(0, 19)} UTC
                </dd>
              </>
            )}
          </dl>

          {a.reviewNotes && !isPending && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs">
              <p className="mb-1 font-semibold text-slate-700">Review notes</p>
              <p className="whitespace-pre-wrap text-slate-700">{a.reviewNotes}</p>
            </div>
          )}

          {isPending && (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
              {isOverdue && (
                <div className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  <AlertTriangle className="mr-1 inline h-3 w-3" />
                  This activation is past the 24h review SLA. The review still counts
                  toward closing the gap, but the audit log will note the SLA breach.
                </div>
              )}
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <strong>AC.L2-3.1.4:</strong> You cannot review your own break-glass
                activation. If the activator is you, route this to a non-activator
                reviewer. The API enforces this; attempts to self-review will be
                rejected with <code>SOD_SELF_REVIEW_BLOCKED</code>.
              </p>
              <label className="block text-xs font-semibold text-slate-700">
                Review notes — required
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  placeholder="Was the activation legitimate? Reference incident-ticket id, observed activity, post-incident review outcome."
                  className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </label>
              {err && <p className="text-xs text-red-700">{err}</p>}
              <button
                type="button"
                disabled={submitting}
                onClick={submit}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {submitting ? "Submitting…" : "Sign post-hoc review"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
