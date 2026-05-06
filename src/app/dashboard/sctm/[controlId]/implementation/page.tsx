import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/db";
import { controlObservedImplementations } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getControlAssessmentLogic } from "@/data/cmmc/control-assessment-logic";
import { getLatestAdjudication } from "@/lib/evidence-engine/adjudication/scorer";
import { AdjudicationStatusBadge } from "@/components/governance/AdjudicationStatusBadge";

/**
 * /dashboard/sctm/[controlId]/implementation
 *
 * Phase 6 — Observed-Implementation Statement (OIS) page. Renders the
 * latest auto-generated narrative for a CMMC control plus the per-(register,
 * entry_type, lifecycle_state) evidence breakdown that drove it. The
 * narrative refreshes on every ISSO weekly export ingest; this page reads
 * the most recent row from control_observed_implementations.
 *
 * Phases 7 / 10 will extend this with the adjudication status pill and the
 * read-only auditor variant respectively.
 */

export default async function OISPage({
  params,
}: {
  params: Promise<{ controlId: string }>;
}) {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string } | undefined)
    ?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const { controlId } = await params;
  const decoded = decodeURIComponent(controlId);

  const logic = getControlAssessmentLogic();
  const control = logic.controls.find((c) => c.control_id === decoded);
  if (!control) notFound();

  // Latest OIS row + last 5 history rows for the timeline panel.
  const rows = await db
    .select()
    .from(controlObservedImplementations)
    .where(
      and(
        eq(controlObservedImplementations.organizationId, orgId),
        eq(controlObservedImplementations.controlId, decoded),
      ),
    )
    .orderBy(desc(controlObservedImplementations.periodEnd))
    .limit(6);

  const latest = rows[0] ?? null;
  const history = rows.slice(1);

  // Phase 7 — latest adjudication snapshot for this control.
  const adjudication = await getLatestAdjudication(orgId, decoded);
  const requirementResults = (adjudication?.requirementsJson ?? []) as Array<{
    register_key: string;
    required_min: number;
    observed_final: number;
    observed_isso_verified: number;
    cadence_days_required: number;
    cadence_days_actual: number | null;
    satisfied: boolean;
    evidence_entry_ids: string[];
    gap_reason?: string;
  }>;

  const evidence =
    (latest?.evidenceSummary ?? {}) as Record<
      string,
      Record<string, Record<string, number>>
    >;

  // Total entry count + per-lifecycle rollup for the at-a-glance card.
  let totalEntries = 0;
  const lifecycleRollup = new Map<string, number>();
  for (const byType of Object.values(evidence)) {
    for (const byLifecycle of Object.values(byType)) {
      for (const [lifecycle, count] of Object.entries(byLifecycle)) {
        totalEntries += count;
        lifecycleRollup.set(lifecycle, (lifecycleRollup.get(lifecycle) ?? 0) + count);
      }
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div>
        <Link
          href="/dashboard/controls"
          className="text-sm text-[var(--color-gray-600)] hover:underline"
        >
          ← Controls
        </Link>
        <div className="mt-1 flex flex-wrap items-baseline gap-3">
          <h1 className="text-xl font-semibold text-[var(--color-navy-primary)]">
            {decoded} — Observed Implementation
          </h1>
          <span className="text-[10px] uppercase tracking-wide rounded-full bg-[var(--color-gray-100)] px-2 py-0.5 text-[var(--color-gray-700)]">
            {control.family} family
          </span>
          {latest?.narrativeLockStartedAt && (
            <span className="text-[10px] uppercase tracking-wide rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
              locked for assessment
            </span>
          )}
          {adjudication && (
            <AdjudicationStatusBadge
              status={adjudication.status}
              confidence={adjudication.confidence}
              size="md"
            />
          )}
        </div>
        <p className="mt-1 text-sm text-[var(--color-gray-600)]">
          Auto-generated narrative derived from observed register entries.
          Refreshes on every ISSO weekly export ingest. Phase 6 of the
          Control Adjudication Ecosystem roadmap.
        </p>
      </div>

      {!latest ? (
        <div className="rounded-[var(--radius-xl)] border border-amber-200 bg-amber-50/40 p-6 text-sm text-amber-900">
          <p className="font-medium">No observed-implementation narrative yet.</p>
          <p className="mt-1 text-xs">
            The OIS engine runs on every ISSO weekly export ingest. Once the
            next manifest lands and touches this control's required registers,
            a narrative will appear here.
          </p>
          <p className="mt-2 text-xs">
            Required registers for {decoded}:{" "}
            <span className="font-mono">
              {control.register_requirements.length === 0
                ? "(none — control has no operational evidence requirement)"
                : control.register_requirements.map((r) => r.register_id).join(", ")}
            </span>
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">
                Implementation statement
              </h2>
              <span className="text-[11px] text-[var(--color-gray-500)]">
                period {latest.periodStart.toString().slice(0, 10)}…
                {latest.periodEnd.toString().slice(0, 10)}
              </span>
            </div>
            <p className="mt-2 leading-relaxed text-[var(--color-gray-800)]">
              {latest.narrative}
            </p>
            <p className="mt-3 text-[11px] text-[var(--color-gray-500)]">
              Generated {new Date(latest.generatedAt).toLocaleString()}
              {latest.generatedFromManifestId && (
                <>
                  {" · "}from manifest{" "}
                  <Link
                    href={`/dashboard/monitoring/manifests/${encodeURIComponent(
                      latest.generatedFromManifestId,
                    )}`}
                    className="font-mono text-[var(--color-blue-accent)] hover:underline"
                  >
                    {latest.generatedFromManifestId.slice(0, 16)}…
                  </Link>
                </>
              )}
              {latest.mostRecentEvidenceAt && (
                <>
                  {" · "}most recent signed evidence{" "}
                  {new Date(latest.mostRecentEvidenceAt).toLocaleString()}
                </>
              )}
            </p>
          </div>

          {/* Phase 7 — Requirement breakdown card */}
          {adjudication && requirementResults.length > 0 && (
            <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">
                  Adjudication requirements ({requirementResults.filter((r) => r.satisfied).length}/{requirementResults.length} satisfied)
                </h2>
                <span className="text-[11px] text-[var(--color-gray-500)]">
                  computed{" "}
                  {new Date(adjudication.computedAt).toLocaleString()}
                </span>
              </div>
              <ul className="mt-3 divide-y divide-[var(--color-border-muted)]">
                {requirementResults.map((req) => (
                  <li key={req.register_key} className="py-3">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                          req.satisfied
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {req.satisfied ? "satisfied" : "gap"}
                      </span>
                      <Link
                        href={`/dashboard/evidence-engine/registers/${encodeURIComponent(
                          req.register_key,
                        )}`}
                        className="font-mono text-xs text-[var(--color-blue-accent)] hover:underline"
                      >
                        {req.register_key}
                      </Link>
                      <span className="text-[11px] text-[var(--color-gray-600)]">
                        {req.observed_final}/{req.required_min} final ·{" "}
                        {req.observed_isso_verified} ISSO-verified ·{" "}
                        cadence{" "}
                        {req.cadence_days_actual === null
                          ? "—"
                          : `${req.cadence_days_actual}d`}
                        /
                        {req.cadence_days_required === 0
                          ? "event-driven"
                          : `${req.cadence_days_required}d`}
                      </span>
                    </div>
                    {req.gap_reason && (
                      <p className="mt-1 text-xs text-red-700">
                        Gap: {req.gap_reason}
                      </p>
                    )}
                    {req.evidence_entry_ids.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {req.evidence_entry_ids.map((id) => (
                          <Link
                            key={id}
                            href={`/dashboard/evidence-engine/entries/${id}`}
                            className="rounded border border-[var(--color-border)] bg-[var(--color-gray-50)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-gray-700)] hover:bg-[var(--color-gray-100)]"
                          >
                            {id.slice(0, 8)}…
                          </Link>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Evidence breakdown card */}
          <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">
                Evidence breakdown ({totalEntries} entr{totalEntries === 1 ? "y" : "ies"})
              </h2>
              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                {Array.from(lifecycleRollup.entries())
                  .sort(([, a], [, b]) => b - a)
                  .map(([lifecycle, count]) => (
                    <span
                      key={lifecycle}
                      className={`rounded-full px-2 py-0.5 font-medium uppercase tracking-wide ${lifecycleTone(
                        lifecycle,
                      )}`}
                    >
                      {count} {lifecycle.replace(/_/g, " ")}
                    </span>
                  ))}
              </div>
            </div>
            {Object.keys(evidence).length === 0 ? (
              <p className="mt-3 text-sm text-[var(--color-gray-500)]">
                No entries observed in the period across the control's required
                registers.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {Object.entries(evidence).map(([registerKey, byType]) => (
                  <div key={registerKey}>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-gray-600)]">
                      <Link
                        href={`/dashboard/evidence-engine/registers/${encodeURIComponent(
                          registerKey,
                        )}`}
                        className="hover:underline"
                      >
                        {registerKey}
                      </Link>
                    </h3>
                    <table className="mt-1 w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--color-border-muted)] text-[11px] uppercase tracking-wide text-[var(--color-gray-500)]">
                          <th className="py-1 text-left">Entry type</th>
                          <th className="py-1 text-left">Lifecycle states</th>
                          <th className="py-1 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(byType).map(([entryType, byLifecycle]) => {
                          const total = Object.values(byLifecycle).reduce(
                            (a, b) => a + b,
                            0,
                          );
                          return (
                            <tr
                              key={entryType}
                              className="border-b border-[var(--color-border-muted)] last:border-0"
                            >
                              <td className="py-1.5 font-mono text-xs">
                                {entryType}
                              </td>
                              <td className="py-1.5">
                                <div className="flex flex-wrap gap-1">
                                  {Object.entries(byLifecycle)
                                    .sort(([, a], [, b]) => b - a)
                                    .map(([lifecycle, count]) => (
                                      <span
                                        key={lifecycle}
                                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${lifecycleTone(
                                          lifecycle,
                                        )}`}
                                      >
                                        {count} {lifecycle.replace(/_/g, " ")}
                                      </span>
                                    ))}
                                </div>
                              </td>
                              <td className="py-1.5 text-right font-mono text-xs text-[var(--color-gray-700)]">
                                {total}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-[11px] text-[var(--color-gray-500)]">
              Cadence requirement:{" "}
              {Math.max(
                ...control.register_requirements.map((r) => r.cadence_days),
                0,
              )}
              {" "}d. Min final entries per register:{" "}
              {Math.max(
                ...control.register_requirements.map((r) => r.min_final_entries),
                0,
              )}
              .
            </p>
          </div>

          {history.length > 0 && (
            <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">
                History ({history.length} prior period{history.length === 1 ? "" : "s"})
              </h2>
              <ul className="mt-3 space-y-1.5">
                {history.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-baseline gap-2 border-b border-[var(--color-border-muted)] pb-1.5 text-sm last:border-0"
                  >
                    <span className="font-mono text-[10px] text-[var(--color-gray-500)]">
                      {row.periodStart.toString().slice(0, 10)}…
                      {row.periodEnd.toString().slice(0, 10)}
                    </span>
                    <span className="flex-1 text-xs text-[var(--color-gray-700)] line-clamp-2">
                      {row.narrative.slice(0, 200)}
                      {row.narrative.length > 200 ? "…" : ""}
                    </span>
                    {row.generatedFromManifestId && (
                      <Link
                        href={`/dashboard/monitoring/manifests/${encodeURIComponent(
                          row.generatedFromManifestId,
                        )}`}
                        className="font-mono text-[10px] text-[var(--color-blue-accent)] hover:underline"
                      >
                        manifest →
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function lifecycleTone(lifecycle: string): string {
  switch (lifecycle) {
    case "draft":
      return "bg-amber-100 text-amber-800";
    case "admin_signed":
      return "bg-blue-100 text-blue-800";
    case "isso_verified":
      return "bg-emerald-100 text-emerald-800";
    case "escalated":
      return "bg-red-100 text-red-800";
    case "disputed":
      return "bg-purple-100 text-purple-800";
    case "resolved":
      return "bg-emerald-50 text-emerald-700";
    case "void":
      return "bg-gray-100 text-gray-600";
    case "auto_recorded":
      return "bg-gray-100 text-gray-700";
    case "auto_recorded_legacy":
      return "bg-gray-50 text-gray-600";
    case "isso_flagged":
      return "bg-amber-100 text-amber-800";
    case "admin_resolved":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-gray-100 text-gray-700";
  }
}
