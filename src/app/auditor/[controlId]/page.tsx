import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { requireAuditorRole } from "@/lib/auditor-role-gate";
import {
  controlObservedImplementations,
  threatNarratives,
  assessments,
  assessorScratchpads,
} from "@/db/schema";
import { and, eq, desc, sql } from "drizzle-orm";
import { getControlAssessmentLogic } from "@/data/cmmc/control-assessment-logic";
import { getLatestAdjudication } from "@/lib/evidence-engine/adjudication/scorer";
import { AdjudicationStatusBadge } from "@/components/governance/AdjudicationStatusBadge";
import { AssessorScratchpad } from "./AssessorScratchpad";

/**
 * /auditor/[controlId] — read-only per-control C3PAO assessment view.
 *
 * Phase 10 of the Control Adjudication Ecosystem roadmap. The auditor
 * sees, in order:
 *   1. Practice statement (control_id + family + register requirements)
 *   2. Phase 6 implementation narrative (latest, frozen if assessment is open)
 *   3. Phase 7 adjudication verdict + per-requirement breakdown
 *   4. Phase 9 active threat narratives that touch this control's registers
 *   5. Evidence list — entries from the past 90d grouped by entry_type
 *      (links open the existing entry-detail page; for now still shows
 *      admin chrome — Auditor role enforcement is a follow-up)
 *   6. Assessor scratchpad (autosaves to assessor_scratchpads when an
 *      assessment is open)
 *
 * The view is intentionally chrome-stripped: no FinalizeButton, no admin
 * forms, no edit affordances. Auditors focus on adjudication, not data
 * entry.
 */

export default async function AuditorControlPage({
  params,
}: {
  params: Promise<{ controlId: string }>;
}) {
  const { orgId } = await requireAuditorRole();
  const { controlId } = await params;
  const decoded = decodeURIComponent(controlId);

  const logic = getControlAssessmentLogic();
  const control = logic.controls.find((c) => c.control_id === decoded);
  if (!control) notFound();

  // Latest OIS narrative.
  const [latestOIS] = await db
    .select()
    .from(controlObservedImplementations)
    .where(
      and(
        eq(controlObservedImplementations.organizationId, orgId),
        eq(controlObservedImplementations.controlId, decoded),
      ),
    )
    .orderBy(desc(controlObservedImplementations.periodEnd))
    .limit(1);

  // Latest CAE verdict + per-requirement breakdown.
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

  // Phase 9 narratives — last 30d that involve any of this control's
  // required registers. We filter in-app by walking related_entry_ids
  // for register_keys overlap; cheap on a list of <50 narratives.
  const narrativeRows = await db
    .select()
    .from(threatNarratives)
    .where(eq(threatNarratives.organizationId, orgId))
    .orderBy(desc(threatNarratives.lastObservedAt))
    .limit(50);
  const requiredRegisterKeys = new Set(
    control.register_requirements.map((r) => r.register_id),
  );
  const relevantNarratives = narrativeRows.filter((n) => {
    const refs = Array.isArray(n.relatedEntryIds)
      ? (n.relatedEntryIds as Array<{ register_key?: string }>)
      : [];
    return refs.some(
      (r) =>
        typeof r.register_key === "string" && requiredRegisterKeys.has(r.register_key),
    );
  });

  // Open assessment for this org? If so, find the scratchpad row for this
  // (assessment, control). Used by the AssessorScratchpad client.
  const [openAssessment] = await db
    .select()
    .from(assessments)
    .where(
      and(eq(assessments.organizationId, orgId), eq(assessments.status, "open")),
    )
    .orderBy(desc(assessments.openedAt))
    .limit(1);

  let scratchpadInitial: { notes: string; verdict: string | null } | null = null;
  if (openAssessment) {
    const [pad] = await db
      .select()
      .from(assessorScratchpads)
      .where(
        and(
          eq(assessorScratchpads.assessmentId, openAssessment.id),
          eq(assessorScratchpads.controlId, decoded),
        ),
      )
      .limit(1);
    scratchpadInitial = pad
      ? { notes: pad.notes, verdict: pad.assessorVerdict }
      : { notes: "", verdict: null };
  }

  const evidenceSummary = (latestOIS?.evidenceSummary ?? {}) as Record<
    string,
    Record<string, Record<string, number>>
  >;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      {/* Header */}
      <header className="border-b border-[var(--color-border)] pb-4">
        <p className="text-[10px] uppercase tracking-wide text-[var(--color-gray-500)]">
          C3PAO assessment view (read-only)
        </p>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-3">
          <Link
            href="/auditor"
            className="text-xs text-[var(--color-blue-accent)] hover:underline"
          >
            ← all controls
          </Link>
          <h1 className="text-2xl font-semibold text-[var(--color-navy-primary)]">
            {decoded}
          </h1>
          <span className="text-[10px] uppercase tracking-wide rounded-full bg-[var(--color-gray-100)] px-2 py-0.5 text-[var(--color-gray-700)]">
            {control.family} family
          </span>
          {adjudication && (
            <AdjudicationStatusBadge
              status={adjudication.status}
              confidence={adjudication.confidence}
              size="md"
            />
          )}
          {latestOIS?.narrativeLockStartedAt && (
            <span className="text-[10px] uppercase tracking-wide rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
              frozen for assessment
            </span>
          )}
        </div>
        {control.register_requirements.length > 0 && (
          <p className="mt-2 text-[11px] text-[var(--color-gray-600)]">
            Required registers:{" "}
            <span className="font-mono">
              {control.register_requirements
                .map((r) => `${r.register_id} (≥${r.min_final_entries}, ${r.cadence_days || "event-driven"}d)`)
                .join(", ")}
            </span>
          </p>
        )}
      </header>

      {/* Implementation narrative */}
      <section className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">
          Implementation statement
        </h2>
        {latestOIS ? (
          <>
            <p className="mt-2 leading-relaxed text-[var(--color-gray-800)]">
              {latestOIS.narrative}
            </p>
            <p className="mt-2 text-[11px] text-[var(--color-gray-500)]">
              Generated{" "}
              {new Date(latestOIS.generatedAt).toLocaleString()} from manifest{" "}
              {latestOIS.generatedFromManifestId ? (
                <Link
                  href={`/dashboard/monitoring/manifests/${encodeURIComponent(
                    latestOIS.generatedFromManifestId,
                  )}`}
                  className="font-mono text-[var(--color-blue-accent)] hover:underline"
                >
                  {latestOIS.generatedFromManifestId.slice(0, 16)}…
                </Link>
              ) : (
                "(manual)"
              )}
              . Most recent admin- or ISSO-signed evidence:{" "}
              {latestOIS.mostRecentEvidenceAt
                ? new Date(latestOIS.mostRecentEvidenceAt).toLocaleString()
                : "—"}
              .
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-[var(--color-gray-500)]">
            No implementation narrative yet — awaiting next ISSO weekly export
            ingest.
          </p>
        )}
      </section>

      {/* Adjudication breakdown */}
      {adjudication && requirementResults.length > 0 && (
        <section className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">
            Engine verdict ({requirementResults.filter((r) => r.satisfied).length}/{requirementResults.length} requirements satisfied)
          </h2>
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
                  <span className="font-mono text-xs text-[var(--color-gray-800)]">
                    {req.register_key}
                  </span>
                  <span className="text-[11px] text-[var(--color-gray-600)]">
                    {req.observed_final}/{req.required_min} final ·{" "}
                    {req.observed_isso_verified} ISSO-verified · cadence{" "}
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
        </section>
      )}

      {/* Threat narratives */}
      {relevantNarratives.length > 0 && (
        <section className="rounded-[var(--radius-xl)] border border-purple-200 bg-purple-50/30 p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-purple-900">
            Active threat narratives ({relevantNarratives.length})
          </h2>
          <p className="mt-1 text-[11px] text-purple-700">
            Cross-evidence joins involving this control's required registers
            (Phase 9 correlation). Click into a narrative to walk the
            contributing entries.
          </p>
          <ul className="mt-3 space-y-2">
            {relevantNarratives.map((n) => (
              <li
                key={n.id}
                className="rounded-md border border-purple-200 bg-white p-3 text-sm"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-medium text-purple-900">
                    {n.narrativeType.replace(/_/g, " ")}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide text-purple-700">
                    {n.status}
                  </span>
                  <span className="text-[10px] text-purple-700">
                    confidence {Math.round(n.confidence * 100)}%
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--color-gray-700)]">
                  {n.summary}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Evidence breakdown */}
      {Object.keys(evidenceSummary).length > 0 && (
        <section className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">
            Evidence inventory
          </h2>
          <p className="mt-1 text-[11px] text-[var(--color-gray-500)]">
            Counts in the period{" "}
            {latestOIS?.periodStart.toString().slice(0, 10)}…
            {latestOIS?.periodEnd.toString().slice(0, 10)}, by register and
            entry type. Click any register to walk the full entry list.
          </p>
          <div className="mt-3 space-y-3">
            {Object.entries(evidenceSummary).map(([registerKey, byType]) => (
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
                <ul className="mt-1 space-y-0.5">
                  {Object.entries(byType).map(([entryType, byLifecycle]) => {
                    const total = Object.values(byLifecycle).reduce(
                      (a, b) => a + b,
                      0,
                    );
                    return (
                      <li
                        key={entryType}
                        className="flex flex-wrap items-baseline gap-2 text-xs"
                      >
                        <span className="font-mono text-[var(--color-gray-800)]">
                          {entryType}
                        </span>
                        <span className="text-[var(--color-gray-700)]">
                          ({total} entr{total === 1 ? "y" : "ies"})
                        </span>
                        {Object.entries(byLifecycle)
                          .sort(([, a], [, b]) => b - a)
                          .map(([lifecycle, count]) => (
                            <span
                              key={lifecycle}
                              className="text-[10px] text-[var(--color-gray-500)]"
                            >
                              {count} {lifecycle.replace(/_/g, " ")}
                            </span>
                          ))}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Assessor scratchpad — only when an assessment is open */}
      {openAssessment && scratchpadInitial && (
        <AssessorScratchpad
          assessmentId={openAssessment.id}
          controlId={decoded}
          initialNotes={scratchpadInitial.notes}
          initialVerdict={scratchpadInitial.verdict}
        />
      )}

      {!openAssessment && (
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/40 p-4 text-xs text-[var(--color-gray-600)]">
          No assessment is currently open. Open an assessment from
          <Link
            href="/dashboard/cae"
            className="ml-1 text-[var(--color-blue-accent)] hover:underline"
          >
            /dashboard/cae
          </Link>{" "}
          to enable scratchpad capture and freeze narratives for the
          duration.
        </div>
      )}
    </div>
  );
}
