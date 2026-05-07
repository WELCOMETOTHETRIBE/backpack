/**
 * Incident Response Testing section for /dashboard/training.
 *
 * Surfaces the latest TrainOS-archived IR tabletop bundle plus everything
 * an auditor needs to see that IR.L2-3.6.1 / 3.6.2 / 3.6.3 are satisfied:
 *
 *   • exercise context (name, methodology, scenario)
 *   • execution date + valid-through (365-day cadence per 3.6.3)
 *   • bundle state (provisional / sealed / rejected) with dispute-window
 *     countdown when applicable
 *   • per-participant attestations (in_room / via_video / via_phone)
 *   • IR control adjudication status per the canonical helper
 *   • bundle sha256 + Azure Gov vault URI link
 *
 * Empty state when no bundle exists: clear "no tabletop on file" with
 * the assessor-relevant cadence note (3.6.3 = annual).
 */

import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Users,
  FileBox,
  ExternalLink,
  Video,
  Phone,
  MapPin,
} from "lucide-react";
import type { IrTabletopSummary } from "@/lib/ir-tabletop/get-summary-for-org";

const BASIS_LABEL: Record<string, { label: string; Icon: typeof MapPin }> = {
  present_in_room: { label: "In room", Icon: MapPin },
  present_via_video: { label: "Video", Icon: Video },
  present_via_phone: { label: "Phone", Icon: Phone },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

export function IrTabletopSection({
  summary,
}: {
  summary: IrTabletopSummary | null;
}) {
  if (!summary) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800/40 dark:bg-amber-950/20">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
              Incident Response Testing — no tabletop on file
            </h2>
            <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
              IR.L2-3.6.3 requires the incident response capability to be tested at least
              annually. Run an exercise from the MacTech Training app — Codex will receive
              the canonical evidence bundle and surface its state here.
            </p>
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              Until then, IR.L2-3.6.1 / 3.6.2 / 3.6.3 stay outstanding.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const validDaysRemaining = daysUntil(summary.validThroughAt);
  const validClass =
    validDaysRemaining === null
      ? "text-gray-500"
      : validDaysRemaining < 0
      ? "text-red-700"
      : validDaysRemaining < 30
      ? "text-amber-700"
      : "text-emerald-700";

  const stateClass =
    summary.bundleState === "sealed"
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : summary.bundleState === "provisional"
      ? "bg-amber-100 text-amber-800 border-amber-200"
      : "bg-red-100 text-red-800 border-red-200";

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      {/* Header strip */}
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-700 dark:bg-slate-900/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600">
              <ShieldAlert className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Incident Response Testing
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                IR.L2-3.6.1 / 3.6.2 / 3.6.3 — annual tabletop cadence
              </p>
            </div>
          </div>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${stateClass}`}
            title={
              summary.bundleState === "provisional"
                ? "Within the 7-day participant dispute window. Becomes sealed once the window closes with no fatal disputes."
                : summary.bundleState === "sealed"
                ? "Past the dispute window. Tamper-evident bundle anchored in the chain."
                : "Bundle was rejected — see audit log."
            }
          >
            {summary.bundleState}
          </span>
        </div>
      </div>

      {/* Top stats row */}
      <div className="grid gap-4 border-b border-slate-200 p-5 dark:border-slate-700 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={Clock}
          label="Executed"
          value={fmtDate(summary.executedAt)}
          sub={`${summary.methodology}${summary.scenarioTitle ? ` · ${summary.scenarioTitle}` : ""}`}
        />
        <Stat
          icon={CheckCircle2}
          label="Valid through"
          value={fmtDate(summary.validThroughAt)}
          sub={
            validDaysRemaining === null
              ? "—"
              : validDaysRemaining < 0
              ? `${Math.abs(validDaysRemaining)}d expired`
              : `${validDaysRemaining}d remaining`
          }
          subClass={validClass}
        />
        <Stat
          icon={Users}
          label="Attestees"
          value={`${summary.participants.length}`}
          sub={summary.attendanceCorroborationKind ?? "facilitator-only"}
        />
        <Stat
          icon={FileBox}
          label="Vault bundle"
          value={summary.bundleSha256 ? `${summary.bundleSha256.slice(0, 8)}…` : "—"}
          sub={summary.bytesPersisted ? "bytes persisted" : "manifest-only"}
          link={summary.vaultStorageUri ?? null}
        />
      </div>

      {/* Dispute window banner (provisional only) */}
      {summary.bundleState === "provisional" && (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-300">
          {summary.disputeWindowDaysRemaining !== null ? (
            <>
              <strong>Provisional</strong> — {summary.disputeWindowDaysRemaining}-day participant
              dispute window remaining. Bundle auto-seals on{" "}
              <span className="font-mono">{fmtDate(summary.attendanceSealAt)}</span> if no
              fatal disputes are filed.
            </>
          ) : (
            <>
              <strong>Provisional</strong> — dispute window has closed but the seal job
              hasn&apos;t run yet. Will transition to <code>sealed</code> on next cron tick.
            </>
          )}
        </div>
      )}

      {/* IR control lines */}
      <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Controls satisfied by this bundle
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {summary.controlLines.map((c) => (
            <div
              key={c.controlId}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                c.adjudicated
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-amber-200 bg-amber-50"
              }`}
            >
              <span className="font-mono text-xs">{c.cmmcId}</span>
              <span
                className={`text-xs font-semibold ${
                  c.adjudicated ? "text-emerald-800" : "text-amber-800"
                }`}
              >
                {c.adjudicated ? (
                  <>
                    <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                    {c.implementationStatus}
                  </>
                ) : (
                  <>
                    <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                    {c.implementationStatus}
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Participants */}
      <div className="px-5 py-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Participants ({summary.participants.length})
        </p>
        {summary.participants.length === 0 ? (
          <p className="text-xs text-slate-500">No attestees recorded.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {summary.participants.map((p) => {
              const basisInfo = p.attestationBasis ? BASIS_LABEL[p.attestationBasis] : null;
              return (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                      {p.name}{" "}
                      <span className="text-xs text-slate-500">· {p.role}</span>
                    </p>
                    {p.email && (
                      <p className="truncate text-xs text-slate-500">{p.email}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {basisInfo ? (
                      <span className="flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                        <basisInfo.Icon className="h-3 w-3" />
                        {basisInfo.label}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">no basis</span>
                    )}
                    {p.disputeState && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          p.disputeState === "confirmed"
                            ? "bg-emerald-100 text-emerald-700"
                            : p.disputeState === "disputed"
                            ? "bg-red-100 text-red-700"
                            : p.disputeState === "expired"
                            ? "bg-slate-100 text-slate-600"
                            : "bg-amber-100 text-amber-800"
                        }`}
                        title="Dispute window state per ir_participant_disputes"
                      >
                        {p.disputeState}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  subClass = "text-slate-500",
  link,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  sub: string;
  subClass?: string;
  link?: string | null;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <p className="mt-0.5 truncate font-mono text-sm text-slate-900 dark:text-slate-100">
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
              title={link}
            >
              {value}
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            value
          )}
        </p>
        <p className={`text-[10px] ${subClass}`}>{sub}</p>
      </div>
    </div>
  );
}
