/**
 * Phase 6 — Observed-Implementation Statement (OIS) generator.
 *
 * For every CMMC control referenced in control_assessment_logic.v1.json:
 *   1. Pull the past N days of register entries on each register the
 *      control's register_requirements list.
 *   2. Bucket the entries by (register_key, entry_type, lifecycle_state)
 *      so the per-control template has count placeholders to render against.
 *   3. Render the per-control template (or generic fallback) into a
 *      narrative paragraph.
 *   4. Persist the row in control_observed_implementations, replacing any
 *      prior row for the same (organization_id, control_id, period_end).
 *
 * The whole point of this engine: the SSP implementation statement becomes
 * a *derived* artifact, not a hand-authored one. Every observation that
 * refreshes the underlying entries automatically refreshes the prose. The
 * generated_from_manifest_id field links each narrative to the specific
 * signed weekly export that drove it, giving the auditor content-hash
 * traceability from prose to evidence.
 *
 * Phases 7 / 8 / 10 consume this:
 *   - Phase 7 CAE re-uses the per-(register, entry_type, lifecycle) counts
 *     to score each requirement.
 *   - Phase 8 Predictive uses most_recent_evidence_at to project
 *     days-until-stale.
 *   - Phase 10 Auditor View locks the narrative for the assessment window.
 */

import { db } from "@/db";
import {
  controlObservedImplementations,
  governanceRegisters,
  governanceRegisterEntries,
} from "@/db/schema";
import { and, eq, gte, lte, sql, desc } from "drizzle-orm";
import { getControlAssessmentLogic } from "@/data/cmmc/control-assessment-logic";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";
import {
  getControlDocuments,
  type ContractDocument,
} from "@/lib/integrations/qms-client";
import { GOVERNANCE_18_CONTROL_IDS } from "@/lib/compliance/governance-18-analysis";

const GOVERNANCE_18_SET = new Set(GOVERNANCE_18_CONTROL_IDS);
import templatesJson from "@/data/cmmc/control_implementation_templates.v1.json";

interface TemplatesFile {
  generic_fallback: string;
  templates: Record<string, string>;
}
const TEMPLATES = templatesJson as TemplatesFile;

/**
 * Per-(register_key, entry_type, lifecycle_state) counts for one control.
 * Persisted to control_observed_implementations.evidence_summary so the UI
 * can render breakdowns without re-querying.
 */
type EvidenceSummary = Record<
  string,
  Record<string, Record<string, number>>
>;

interface GenerationContext {
  orgId: string;
  periodStartUtc: Date;
  periodEndUtc: Date;
  manifestId: string | null;
}

interface GenerationResult {
  control_id: string;
  narrative: string;
  evidence_summary: EvidenceSummary;
  most_recent_evidence_at: Date | null;
  total_register_entries: number;
}

/**
 * Generate or refresh OIS rows for the given controls. Idempotent on
 * (organization_id, control_id, period_end) — re-running for the same
 * period replaces the rows. Returns one result per control attempted.
 *
 * Locked rows (narrative_lock_started_at IS NOT NULL) are SKIPPED so an
 * in-progress assessment sees a stable narrative. The skip is silent —
 * call sites can compare the result count to the input set if they care.
 */
export async function regenerateOIS(
  ctx: GenerationContext,
  controlIds: readonly string[],
): Promise<GenerationResult[]> {
  if (controlIds.length === 0) return [];

  const logic = getControlAssessmentLogic();
  const controlsByid = new Map(logic.controls.map((c) => [c.control_id, c]));

  const results: GenerationResult[] = [];
  const now = new Date();

  for (const controlId of controlIds) {
    const control = controlsByid.get(controlId);
    if (!control) {
      // Unknown control id — out of scope, skip silently.
      continue;
    }

    // Skip controls whose row is locked for an active assessment.
    const [existing] = await db
      .select({
        id: controlObservedImplementations.id,
        narrativeLockStartedAt:
          controlObservedImplementations.narrativeLockStartedAt,
      })
      .from(controlObservedImplementations)
      .where(
        and(
          eq(controlObservedImplementations.organizationId, ctx.orgId),
          eq(controlObservedImplementations.controlId, controlId),
          eq(controlObservedImplementations.periodEnd, ctx.periodEndUtc),
        ),
      )
      .limit(1);
    if (existing && existing.narrativeLockStartedAt) {
      continue;
    }

    const summary = await buildEvidenceSummary(
      ctx,
      control.register_requirements.map((r) => r.register_id),
    );

    let narrative = renderNarrative(controlId, control, ctx, summary);

    // Phase 13 — append QMS-derived documentation section for the 17
    // pure-governance controls. Sourced from the v2.1 contract via
    // qms-client. Returns "" if the control isn't governance-18 or QMS
    // is unreachable; never throws.
    if (GOVERNANCE_18_SET.has(controlId)) {
      const docsSection = await buildQmsGovernanceSection(controlId);
      if (docsSection) {
        narrative = `${narrative}\n\n${docsSection}`;
      }
    }

    const totalEntries = sumAcrossSummary(summary.evidence_summary);

    if (existing) {
      await db
        .update(controlObservedImplementations)
        .set({
          periodStart: ctx.periodStartUtc,
          narrative,
          evidenceSummary: summary.evidence_summary as unknown as Record<
            string,
            unknown
          >,
          generatedAt: now,
          generatedFromManifestId: ctx.manifestId,
          mostRecentEvidenceAt: summary.most_recent_evidence_at,
          updatedAt: now,
        })
        .where(eq(controlObservedImplementations.id, existing.id));
    } else {
      await db.insert(controlObservedImplementations).values({
        organizationId: ctx.orgId,
        controlId,
        periodStart: ctx.periodStartUtc,
        periodEnd: ctx.periodEndUtc,
        narrative,
        evidenceSummary: summary.evidence_summary as unknown as Record<
          string,
          unknown
        >,
        generatedAt: now,
        generatedFromManifestId: ctx.manifestId,
        mostRecentEvidenceAt: summary.most_recent_evidence_at,
      });
    }

    results.push({
      control_id: controlId,
      narrative,
      evidence_summary: summary.evidence_summary,
      most_recent_evidence_at: summary.most_recent_evidence_at,
      total_register_entries: totalEntries,
    });
  }

  return results;
}

/**
 * Aggregate entries on a control's required registers in the period and
 * bucket them by (register_key, entry_type, lifecycle_state). Also returns
 * the most recent admin_signed-or-isso_verified entry timestamp for
 * Phase-8 freshness projection.
 */
async function buildEvidenceSummary(
  ctx: GenerationContext,
  registerIds: readonly string[],
): Promise<{
  evidence_summary: EvidenceSummary;
  most_recent_evidence_at: Date | null;
}> {
  const summary: EvidenceSummary = {};
  let mostRecent: Date | null = null;

  for (const registerKey of registerIds) {
    const candidates = resolveRegisterKeyCandidates(registerKey);
    const matchingRegisters = await db
      .select({
        id: governanceRegisters.id,
        registerKey: governanceRegisters.registerKey,
      })
      .from(governanceRegisters)
      .where(
        and(
          eq(governanceRegisters.organizationId, ctx.orgId),
          sql`${governanceRegisters.registerKey} IN (${sql.join(
            candidates.map((k) => sql`${k}`),
            sql`, `,
          )})`,
        ),
      );

    if (matchingRegisters.length === 0) continue;

    const registerIdSet = matchingRegisters.map((r) => r.id);

    const rows = await db
      .select({
        entryType: governanceRegisterEntries.entryType,
        status: governanceRegisterEntries.status,
        finalizedAt: governanceRegisterEntries.finalizedAt,
        updatedAt: governanceRegisterEntries.updatedAt,
        entryData: governanceRegisterEntries.entryData,
      })
      .from(governanceRegisterEntries)
      .where(
        and(
          sql`${governanceRegisterEntries.registerId} IN (${sql.join(
            registerIdSet.map((id) => sql`${id}`),
            sql`, `,
          )})`,
          gte(governanceRegisterEntries.createdAt, ctx.periodStartUtc),
          lte(governanceRegisterEntries.createdAt, ctx.periodEndUtc),
        ),
      );

    for (const row of rows) {
      const entryType = row.entryType ?? "(unknown)";
      const data = (row.entryData ?? null) as Record<string, unknown> | null;
      const lifecycle =
        (data?.lifecycle_state as string | undefined) ??
        // Fall back to "auto_recorded" for legacy entries pre-backfill.
        (row.status === "draft" ? "draft" : "auto_recorded");

      summary[registerKey] ??= {};
      summary[registerKey][entryType] ??= {};
      summary[registerKey][entryType][lifecycle] =
        (summary[registerKey][entryType][lifecycle] ?? 0) + 1;

      if (lifecycle === "admin_signed" || lifecycle === "isso_verified") {
        const ts = row.finalizedAt ?? row.updatedAt ?? null;
        if (ts && (!mostRecent || ts > mostRecent)) mostRecent = ts;
      }
    }
  }

  return { evidence_summary: summary, most_recent_evidence_at: mostRecent };
}

function renderNarrative(
  controlId: string,
  control: { family: string; register_requirements: { register_id: string; cadence_days: number; min_final_entries: number }[] },
  ctx: GenerationContext,
  summary: { evidence_summary: EvidenceSummary; most_recent_evidence_at: Date | null },
): string {
  const template =
    TEMPLATES.templates[controlId] ?? TEMPLATES.generic_fallback;

  const periodMs =
    ctx.periodEndUtc.getTime() - ctx.periodStartUtc.getTime();
  const periodDays = Math.max(1, Math.round(periodMs / (1000 * 60 * 60 * 24)));

  return resolvePlaceholders(template, {
    control_id: controlId,
    family: control.family,
    period_start: ctx.periodStartUtc.toISOString().slice(0, 10),
    period_end: ctx.periodEndUtc.toISOString().slice(0, 10),
    period_days: String(periodDays),
    register_keys_csv: control.register_requirements
      .map((r) => r.register_id)
      .join(", "),
    cadence_days_required: String(
      Math.max(...control.register_requirements.map((r) => r.cadence_days), 0),
    ),
    cadence_status_sentence: cadenceStatusSentence(
      summary.most_recent_evidence_at,
      Math.max(...control.register_requirements.map((r) => r.cadence_days), 0),
      ctx.periodEndUtc,
    ),
    most_recent_evidence_at_human: humanizeTimestamp(
      summary.most_recent_evidence_at,
    ),
    total_entries: String(sumAcrossSummary(summary.evidence_summary)),
    lifecycle_breakdown: lifecycleBreakdownSentence(summary.evidence_summary),
    // count.<register>.<entry_type>.<lifecycle> + total.<register>.<entry_type>
    ...flattenSummaryToPlaceholders(summary.evidence_summary),
  });
}

/**
 * Resolve `{{key}}` placeholders against a value bag. Unresolved keys
 * collapse to "0" (numeric) or "—" (string-y) so the output is never
 * littered with raw braces. Both heuristics: known count placeholders
 * default to "0" so e.g. {{count.foo.bar.draft}} reads cleanly when
 * there were zero matches.
 */
function resolvePlaceholders(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, raw) => {
    const key = String(raw);
    if (key in values) return values[key];
    if (key.startsWith("count.") || key.startsWith("total.")) return "0";
    return "—";
  });
}

/**
 * Flatten the nested evidence_summary into flat keys the templates can
 * reference: count.<register_key>.<entry_type>.<lifecycle> and
 * total.<register_key>.<entry_type>.
 */
function flattenSummaryToPlaceholders(
  summary: EvidenceSummary,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [register, byType] of Object.entries(summary)) {
    for (const [entryType, byLifecycle] of Object.entries(byType)) {
      let total = 0;
      for (const [lifecycle, count] of Object.entries(byLifecycle)) {
        out[`count.${register}.${entryType}.${lifecycle}`] = String(count);
        total += count;
      }
      out[`total.${register}.${entryType}`] = String(total);
    }
  }
  return out;
}

function sumAcrossSummary(summary: EvidenceSummary): number {
  let total = 0;
  for (const byType of Object.values(summary)) {
    for (const byLifecycle of Object.values(byType)) {
      for (const count of Object.values(byLifecycle)) total += count;
    }
  }
  return total;
}

function lifecycleBreakdownSentence(summary: EvidenceSummary): string {
  const lifecycleTotals = new Map<string, number>();
  for (const byType of Object.values(summary)) {
    for (const byLifecycle of Object.values(byType)) {
      for (const [lifecycle, count] of Object.entries(byLifecycle)) {
        lifecycleTotals.set(
          lifecycle,
          (lifecycleTotals.get(lifecycle) ?? 0) + count,
        );
      }
    }
  }
  if (lifecycleTotals.size === 0) return "no entries observed";
  const parts = Array.from(lifecycleTotals.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([lifecycle, count]) => `${count} ${lifecycle.replace(/_/g, " ")}`);
  return parts.join(", ");
}

function humanizeTimestamp(ts: Date | null): string {
  if (!ts) return "no admin- or ISSO-signed evidence in this period";
  return ts.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

function cadenceStatusSentence(
  mostRecent: Date | null,
  cadenceDays: number,
  periodEnd: Date,
): string {
  if (cadenceDays === 0) return "Cadence: event-driven (no time-based requirement).";
  if (!mostRecent) {
    return `Cadence is at risk — no admin- or ISSO-signed evidence within the period.`;
  }
  const ageMs = periodEnd.getTime() - mostRecent.getTime();
  const ageDays = Math.round(ageMs / (1000 * 60 * 60 * 24));
  if (ageDays > cadenceDays) {
    return `Cadence is BREACHED — most recent signed evidence is ${ageDays}d old (cadence requirement: ${cadenceDays}d).`;
  }
  if (ageDays > cadenceDays * 0.75) {
    return `Cadence is approaching staleness — most recent signed evidence is ${ageDays}d old (cadence requirement: ${cadenceDays}d).`;
  }
  return `Cadence is fresh — most recent signed evidence is ${ageDays}d old (cadence requirement: ${cadenceDays}d).`;
}

/**
 * Convenience: regenerate OIS for ALL controls with at least one register
 * requirement. Used by a maintenance API or a manual trigger; the
 * dispatcher hook only regenerates for `controls_touched`.
 */
export async function regenerateOISAllControls(
  ctx: GenerationContext,
): Promise<GenerationResult[]> {
  const logic = getControlAssessmentLogic();
  return regenerateOIS(
    ctx,
    logic.controls
      .filter((c) => c.register_requirements.length > 0)
      .map((c) => c.control_id),
  );
}

/**
 * Read the latest OIS row for a given (org, control). Most recent by
 * period_end. Used by /dashboard/cae/[controlId]/implementation page.
 */
export async function getLatestOIS(
  orgId: string,
  controlId: string,
): Promise<typeof controlObservedImplementations.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(controlObservedImplementations)
    .where(
      and(
        eq(controlObservedImplementations.organizationId, orgId),
        eq(controlObservedImplementations.controlId, controlId),
      ),
    )
    .orderBy(desc(controlObservedImplementations.periodEnd))
    .limit(1);
  return row ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Governance-18 QMS documentation section (Phase 13 / Sprint 3.D)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the "Documentation:" section appended to the OIS narrative for
 * pure-governance controls. Reads the v2.1 contract via qms-client. Returns
 * "" on any failure — QMS unreachable, no docs tagged, malformed payload —
 * so the OIS narrative degrades gracefully to register-only prose.
 *
 * Format mirrors the brief's example:
 *   "Documentation: governance is captured in QMS document 'Separation of
 *    Duties Policy' v2.4, last reviewed 2026-04-03, next review 2027-04-03
 *    (current within the 365-day cycle)."
 *
 * Branches on source — bundle docs (no PeriodicReview) emit "effective
 * YYYY-MM-DD" instead of "last reviewed".
 */
async function buildQmsGovernanceSection(controlId: string): Promise<string> {
  const contract = await getControlDocuments(controlId);
  if (!contract || contract.documents.length === 0) return "";

  const sentences = contract.documents.map((d) => formatDocSentence(d));
  return `Documentation: ${sentences.join(" ")}`;
}

function formatDocSentence(d: ContractDocument): string {
  const titleClause = d.current_version
    ? `'${d.title}' v${d.current_version}`
    : `'${d.title}'`;

  const dateClause =
    d.source === "qms_managed"
      ? d.last_reviewed_at
        ? `last reviewed ${formatIsoDate(d.last_reviewed_at)}`
        : "no completed review on file"
      : d.current_version_effective_date
        ? `effective ${formatIsoDate(d.current_version_effective_date)}`
        : "no effective date on file";

  const nextClause = d.next_review_due_at
    ? `, next review ${formatIsoDate(d.next_review_due_at)}`
    : "";

  const cycleClause = formatCycleClause(d);

  return `Governance is captured in QMS document ${titleClause} (${d.doc_id}), ${dateClause}${nextClause}${cycleClause}.`;
}

function formatIsoDate(iso: string): string {
  // Trim to YYYY-MM-DD for narrative readability; ISO already starts with that.
  return iso.slice(0, 10);
}

function formatCycleClause(d: ContractDocument): string {
  switch (d.review_cycle_status) {
    case "current":
      return d.cadence_label
        ? ` (current within the ${d.cadence_label} cycle)`
        : " (current)";
    case "due_soon":
      return " (review due soon)";
    case "overdue":
      return " (review overdue)";
    case "expired":
      return " (review expired — past the cadence + grace window)";
    default:
      return "";
  }
}
