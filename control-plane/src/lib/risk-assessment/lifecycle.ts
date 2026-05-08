/**
 * RA.L2-3.11.1 — Risk Assessment lifecycle helpers.
 *
 * Owns the `risk_assessments` lifecycle envelope. The envelope is
 * separate from the per-risk rows in `governance_register_entries`
 * (which carry `entryData.assessment_id` matching this row's
 * `assessmentPivotId`). The split exists because:
 *
 *   - Risks are fluid (draft entries flicker through the wizard,
 *     re-shape on every step).
 *   - The assessment as a whole is a single audit-defensible
 *     deliverable with a sign-off chain, hashes, and an immutability
 *     boundary.
 *
 * Treating those as the same row would conflate "this risk's status"
 * with "this assessment's status" — the C3PAO walkthrough needs both,
 * and they evolve on different timescales.
 */
import { and, desc, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import {
  riskAssessments,
  governanceRegisterEntries,
  governanceRegisters,
} from "@/db/schema";

const ONE_DAY_MS = 86_400_000;

/**
 * Allowed status transitions. Once a row is `finalized` or `superseded`
 * it is immutable except via the supersession flow (a *new* assessment
 * supersedes the old one — we never edit the old row's content fields).
 */
export const TERMINAL_STATUSES = ["finalized", "superseded"] as const;

export type LifecycleStatus =
  | "not_started"
  | "draft"
  | "in_progress"
  | "ready_for_review"
  | "reviewed"
  | "ready_for_approval"
  | "approved"
  | "finalized"
  | "superseded"
  | "overdue";

export type ObjectiveStatus = "met" | "not_met" | "not_applicable" | "unknown";

export type RiskAssessmentRow = typeof riskAssessments.$inferSelect;

/**
 * Find-or-create the lifecycle row for a freshly-submitted assessment.
 * Called from the submit endpoint after the per-risk register entries
 * have been written. Idempotent on `assessmentPivotId`.
 */
export async function ensureAssessmentEnvelope(input: {
  organizationId: string;
  boundaryId: string;
  assessmentPivotId: string;
  organizationName?: string | null;
  systemName?: string | null;
  assessorDisplayName?: string | null;
  reviewerDisplayName?: string | null;
  approverDisplayName?: string | null;
  reviewPeriodStart?: string | null;
  reviewPeriodEnd?: string | null;
  /**
   * The customer-defined cadence in days (must be ≤ 366; the schema
   * CHECK constraint blocks anything bigger). `null` means the customer
   * hasn't declared one yet — in which case objective [a] stays
   * `unknown`.
   */
  definedFrequencyDays?: number | null;
  submittedByUserId?: string | null;
}): Promise<RiskAssessmentRow> {
  const existing = await db
    .select()
    .from(riskAssessments)
    .where(eq(riskAssessments.assessmentPivotId, input.assessmentPivotId))
    .limit(1);

  if (existing[0]) {
    // The pivot already has an envelope. Refresh editable fields without
    // touching status/objective columns — those move via explicit endpoints.
    if (TERMINAL_STATUSES.includes(existing[0].status as "finalized" | "superseded")) {
      return existing[0];
    }
    const [updated] = await db
      .update(riskAssessments)
      .set({
        organizationName: input.organizationName ?? existing[0].organizationName,
        systemName: input.systemName ?? existing[0].systemName,
        assessorDisplayName:
          input.assessorDisplayName ?? existing[0].assessorDisplayName,
        reviewerDisplayName:
          input.reviewerDisplayName ?? existing[0].reviewerDisplayName,
        approverDisplayName:
          input.approverDisplayName ?? existing[0].approverDisplayName,
        reviewPeriodStart:
          input.reviewPeriodStart ?? existing[0].reviewPeriodStart,
        reviewPeriodEnd: input.reviewPeriodEnd ?? existing[0].reviewPeriodEnd,
        definedFrequencyDays:
          input.definedFrequencyDays ?? existing[0].definedFrequencyDays,
        submittedByUserId:
          input.submittedByUserId ?? existing[0].submittedByUserId,
        submittedAt: existing[0].submittedAt ?? new Date(),
      })
      .where(eq(riskAssessments.id, existing[0].id))
      .returning();
    return updated;
  }

  // Compute next_due_date from frequency + period_end (if both present).
  const nextDueDate =
    input.definedFrequencyDays && input.reviewPeriodEnd
      ? addDaysISO(input.reviewPeriodEnd, input.definedFrequencyDays)
      : null;

  const [created] = await db
    .insert(riskAssessments)
    .values({
      organizationId: input.organizationId,
      boundaryId: input.boundaryId,
      assessmentPivotId: input.assessmentPivotId,
      organizationName: input.organizationName ?? null,
      systemName: input.systemName ?? null,
      assessorDisplayName: input.assessorDisplayName ?? null,
      reviewerDisplayName: input.reviewerDisplayName ?? null,
      approverDisplayName: input.approverDisplayName ?? null,
      reviewPeriodStart: input.reviewPeriodStart ?? null,
      reviewPeriodEnd: input.reviewPeriodEnd ?? null,
      definedFrequencyDays: input.definedFrequencyDays ?? null,
      nextDueDate,
      status: "draft",
      submittedByUserId: input.submittedByUserId ?? null,
      submittedAt: new Date(),
    })
    .returning();
  return created;
}

/**
 * RA.L2-3.11.1[a] — "The frequency to assess risk … is defined."
 *
 * Met when:
 *   - definedFrequencyDays is set and ≤ 366
 *   - reviewPeriodStart and reviewPeriodEnd are present
 *   - nextDueDate is computable / present
 *
 * The C3PAO will literally ask "what's your defined frequency?" The
 * answer must be a number ≤ 365 days (the spec says "annual at minimum"
 * — anything longer than a year fails the objective on its face).
 */
export function evaluateObjectiveA(
  row: Pick<
    RiskAssessmentRow,
    "definedFrequencyDays" | "reviewPeriodStart" | "reviewPeriodEnd" | "nextDueDate"
  >,
): { status: ObjectiveStatus; rationale: string } {
  if (!row.definedFrequencyDays) {
    return { status: "not_met", rationale: "No assessment frequency defined." };
  }
  if (row.definedFrequencyDays > 366) {
    return {
      status: "not_met",
      rationale: `Defined frequency (${row.definedFrequencyDays}d) exceeds one year.`,
    };
  }
  if (!row.reviewPeriodStart || !row.reviewPeriodEnd) {
    return {
      status: "not_met",
      rationale: "Review period start/end not captured.",
    };
  }
  if (!row.nextDueDate) {
    return {
      status: "not_met",
      rationale: "Next due date not computable from current data.",
    };
  }
  return {
    status: "met",
    rationale: `Frequency = ${row.definedFrequencyDays}d; next due ${row.nextDueDate}.`,
  };
}

/**
 * RA.L2-3.11.1[b] — "Risk … is assessed with the defined frequency."
 *
 * Met when:
 *   - The pivot has ≥1 finalized risk register entry (the assessment
 *     actually happened — at least one risk was identified or the
 *     scope_only entry exists).
 *   - approver_display_name is set (sign-off chain complete).
 *   - approved_at is within the defined frequency window.
 *
 * Note: a clean assessment with zero identified risks is still a valid
 * assessment (you can assess and conclude no risks meet your threshold).
 * What's NOT acceptable is no register entries at all — that means the
 * wizard never finalized.
 */
export async function evaluateObjectiveB(
  row: Pick<
    RiskAssessmentRow,
    "id" | "assessmentPivotId" | "approverDisplayName" | "approvedAt" | "definedFrequencyDays"
  >,
): Promise<{ status: ObjectiveStatus; rationale: string; risksCount: number }> {
  // Count finalized risk-register entries pinned to this pivot.
  const counts = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(governanceRegisterEntries)
    .innerJoin(
      governanceRegisters,
      eq(governanceRegisterEntries.registerId, governanceRegisters.id),
    )
    .where(
      and(
        eq(governanceRegisters.registerKey, "risk_register"),
        sql`${governanceRegisterEntries.entryData} ->> 'assessment_id' = ${row.assessmentPivotId}`,
        eq(governanceRegisterEntries.status, "final"),
      ),
    );
  const risksCount = counts[0]?.n ?? 0;

  if (risksCount === 0) {
    return {
      status: "not_met",
      rationale: "No finalized risks captured against this assessment pivot.",
      risksCount,
    };
  }
  if (!row.approverDisplayName || !row.approvedAt) {
    return {
      status: "not_met",
      rationale: "Approver sign-off not recorded.",
      risksCount,
    };
  }

  // Within frequency window?
  if (row.definedFrequencyDays) {
    const ageDays =
      (Date.now() - row.approvedAt.getTime()) / ONE_DAY_MS;
    if (ageDays > row.definedFrequencyDays) {
      return {
        status: "not_met",
        rationale: `Last approval is ${Math.round(ageDays)}d old; defined frequency is ${row.definedFrequencyDays}d.`,
        risksCount,
      };
    }
  }

  return {
    status: "met",
    rationale: `${risksCount} finalized risk(s); approved by ${row.approverDisplayName}.`,
    risksCount,
  };
}

/**
 * Hard gate consulted by POST /finalize. Returns the list of blocking
 * conditions; empty array means "ok to finalize."
 *
 * Blockers (mirrors the spec's "Validation Rules — block finalization
 * if" list, narrowed to what the lifecycle row alone can verify;
 * unresolved high/critical risks without treatment is enforced by the
 * finalize endpoint via a separate query).
 */
export function blockerListForFinalize(row: RiskAssessmentRow, opts: {
  unresolvedHighCriticalWithoutTreatment: number;
  finalReportSha256: string | null;
  packageSha256: string | null;
  evidenceManifestSha256: string | null;
  vaultArtifactPointer: string | null;
  objectiveA: ObjectiveStatus;
  objectiveB: ObjectiveStatus;
}): string[] {
  const blockers: string[] = [];

  if (TERMINAL_STATUSES.includes(row.status as "finalized" | "superseded")) {
    blockers.push(`Already ${row.status}; create a new assessment to supersede.`);
  }
  if (!row.definedFrequencyDays) blockers.push("definedFrequencyDays missing.");
  if (row.definedFrequencyDays && row.definedFrequencyDays > 366) {
    blockers.push("definedFrequencyDays exceeds one year.");
  }
  if (!row.reviewPeriodStart || !row.reviewPeriodEnd) {
    blockers.push("review period missing.");
  }
  if (!row.boundaryId) blockers.push("boundaryId missing.");
  if (opts.objectiveA !== "met" && opts.objectiveA !== "not_applicable") {
    blockers.push("objective [a] not satisfied.");
  }
  if (opts.objectiveB !== "met" && opts.objectiveB !== "not_applicable") {
    blockers.push("objective [b] not satisfied.");
  }
  if (!opts.finalReportSha256) blockers.push("final_report_sha256 missing.");
  // package_sha256 / evidence_manifest_sha256 / vault_artifact_pointer are
  // only required in vault-deployed mode. Phase 1 (pilot) treats them as
  // recommended but not mandatory because the bundle is generated on
  // demand by /api/risk-assessment/bundle/[id] and the bytes don't yet
  // live in a vault.
  if (opts.unresolvedHighCriticalWithoutTreatment > 0) {
    blockers.push(
      `${opts.unresolvedHighCriticalWithoutTreatment} unresolved high/critical risk(s) with no treatment record.`,
    );
  }
  return blockers;
}

/**
 * Find the most recent finalized assessment for an org. Used by the
 * attestation click-gate and the readiness endpoint.
 */
export async function getMostRecentFinalized(orgId: string) {
  const [row] = await db
    .select()
    .from(riskAssessments)
    .where(
      and(
        eq(riskAssessments.organizationId, orgId),
        eq(riskAssessments.status, "finalized"),
      ),
    )
    .orderBy(desc(riskAssessments.finalizedAt))
    .limit(1);
  return row ?? null;
}

/**
 * Add `days` to an ISO date string (YYYY-MM-DD), return ISO date string.
 */
function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
