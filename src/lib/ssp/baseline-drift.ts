/**
 * SSP Baseline Drift detection engine — Phase 2 of "controlled
 * baseline + drift."
 *
 * Compares the current state of the platform's evidence, control
 * findings, boundary inventory, and POA&Ms against the controlled
 * baseline anchored by ssp_release_baselines (Phase 1). Each
 * divergence is classified per the rules in baseline-drift-rules.ts
 * and recorded as a row in ssp_baseline_drift_events.
 *
 * Idempotent on re-run: existing OPEN events for the same
 * (baseline, drift_type, source_record, control) tuple are refreshed
 * (detected_at + current_*) rather than duplicated. Once an event is
 * acknowledged/dismissed/resolved, a fresh divergence opens a new
 * event.
 *
 * Tenant isolation: every read + write is scoped by organizationId.
 *
 * Scope of v2:
 *   - Evidence-citation hash drift  → minor / moderate
 *   - Control aggregateFinding drift → moderate / material
 *   - Boundary component additions   → material
 *   - POA&Ms opened/closed since baseline release → moderate
 *
 * Out of scope for v2 (need data models the control plane doesn't
 * have first-class today): FIPS/crypto boundary changes, IdP swaps,
 * SIEM stack swaps, backup architecture changes, narrative-only
 * material drift. The detection engine is structured so each
 * detector is independent — adding more is additive.
 */
import { and, eq, gt, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  boundaryComponents,
  controlAdjudicationSnapshots,
  controlRecords,
  poamEntries,
  sspBaselineDriftEvents,
  sspDocuments,
  sspEvidenceCitations,
  sspReleaseBaselines,
  sspSectionRevisions,
} from "@/db/schema";
import {
  classifyBoundaryComponentAdded,
  classifyControlFindingChange,
  classifyEvidenceHashChanged,
  classifyEvidenceRemoved,
  classifyPoamClosedPostBaseline,
  classifyPoamOpenedPostBaseline,
  type Classification,
} from "./baseline-drift-rules";
import { fetchCurrentEvidenceHashes } from "./drift";

type Tx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface DetectDriftInput {
  organizationId: string;
  baselineId: string;
}

export interface DetectDriftResult {
  baselineId: string;
  /** Total drift events open after this detection pass. */
  openEventCount: number;
  /** New events emitted on this pass (not already present as OPEN). */
  newEventCount: number;
  /** Existing OPEN events refreshed (detected_at moved). */
  refreshedEventCount: number;
  bySeverity: Record<"minor" | "moderate" | "material", number>;
}

interface CandidateEvent {
  driftType: string;
  classification: Classification;
  sourceTable: string | null;
  sourceRecordId: string | null;
  controlId: string | null;
  previousHash: string | null;
  currentHash: string | null;
  previousValueJson: unknown;
  currentValueJson: unknown;
  summary: string;
}

/**
 * Run all detectors against the active baseline and emit/refresh
 * drift events. Returns the post-detection counts for the caller's
 * UI/log surface.
 */
export async function detectDriftAgainstBaseline(
  input: DetectDriftInput,
): Promise<DetectDriftResult> {
  // 1. Read the baseline and verify it belongs to this org.
  const [baseline] = await db
    .select()
    .from(sspReleaseBaselines)
    .where(
      and(
        eq(sspReleaseBaselines.id, input.baselineId),
        eq(sspReleaseBaselines.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!baseline) {
    throw new Error(
      `baseline ${input.baselineId} not found for org ${input.organizationId}`,
    );
  }

  // 2. Read the SSP doc + the pinned section revisions. Section
  //    revisions hold the per-control aggregateFinding pinned at SSP
  //    generation, which is what the control-finding detector
  //    compares against.
  const [doc] = await db
    .select()
    .from(sspDocuments)
    .where(eq(sspDocuments.id, baseline.sspDocumentId))
    .limit(1);
  if (!doc) {
    throw new Error(
      `SSP document ${baseline.sspDocumentId} not found — baseline ${baseline.id} is orphaned`,
    );
  }

  const sections = await db
    .select()
    .from(sspSectionRevisions)
    .where(eq(sspSectionRevisions.sspDocumentId, doc.id));

  const citations = await db
    .select()
    .from(sspEvidenceCitations)
    .where(eq(sspEvidenceCitations.sspDocumentId, doc.id));

  // 3. Run each detector to produce candidate events.
  const candidates: CandidateEvent[] = [];

  candidates.push(...(await detectEvidenceDrift({ citations })));

  candidates.push(
    ...(await detectControlFindingDrift({
      organizationId: input.organizationId,
      sections,
    })),
  );

  candidates.push(
    ...(await detectBoundaryComponentAdditions({
      boundaryId: baseline.boundaryId,
      releasedAt: baseline.releasedAt,
    })),
  );

  candidates.push(
    ...(await detectPoamDrift({
      organizationId: input.organizationId,
      sections,
      releasedAt: baseline.releasedAt,
    })),
  );

  // 4. Upsert candidate → ssp_baseline_drift_events. Idempotent per
  //    the dedup index: existing OPEN events refresh, new events
  //    insert.
  const upsertResult = await upsertCandidates({
    organizationId: input.organizationId,
    baselineId: input.baselineId,
    candidates,
  });

  // 5. Tally severity counts of currently-open events for the UI.
  const openCounts = await db
    .select({
      severity: sspBaselineDriftEvents.severity,
      count: sql<number>`count(*)::int`,
    })
    .from(sspBaselineDriftEvents)
    .where(
      and(
        eq(sspBaselineDriftEvents.organizationId, input.organizationId),
        eq(sspBaselineDriftEvents.baselineId, input.baselineId),
        eq(sspBaselineDriftEvents.status, "open"),
      ),
    )
    .groupBy(sspBaselineDriftEvents.severity);

  const bySeverity = { minor: 0, moderate: 0, material: 0 } as Record<
    "minor" | "moderate" | "material",
    number
  >;
  let openEventCount = 0;
  for (const row of openCounts) {
    const sev = row.severity as "minor" | "moderate" | "material";
    if (sev in bySeverity) {
      bySeverity[sev] = row.count;
      openEventCount += row.count;
    }
  }

  return {
    baselineId: input.baselineId,
    openEventCount,
    newEventCount: upsertResult.inserted,
    refreshedEventCount: upsertResult.refreshed,
    bySeverity,
  };
}

/* ────────── Evidence detector ───────────────────────────────────── */

async function detectEvidenceDrift(input: {
  citations: Array<typeof sspEvidenceCitations.$inferSelect>;
}): Promise<CandidateEvent[]> {
  const out: CandidateEvent[] = [];
  if (input.citations.length === 0) return out;

  const currentByKey = await fetchCurrentEvidenceHashes(input.citations);

  for (const c of input.citations) {
    const key = `${c.evidenceKind}:${c.evidenceId}`;
    const currentHash = currentByKey.get(key);

    if (currentHash === undefined) {
      // Detector has no current-hash fetcher for this evidence kind;
      // mirror the existing drift.ts behavior (treat as identical).
      continue;
    }
    if (currentHash === null) {
      const cls = classifyEvidenceRemoved();
      out.push({
        driftType: "evidence_removed",
        classification: cls,
        sourceTable: "ssp_evidence_citations",
        sourceRecordId: c.id,
        controlId: c.controlId,
        previousHash: c.evidenceSha256,
        currentHash: null,
        previousValueJson: {
          evidence_kind: c.evidenceKind,
          evidence_id: c.evidenceId,
        },
        currentValueJson: null,
        summary: `Cited evidence ${c.evidenceKind}:${c.evidenceId} no longer exists.`,
      });
      continue;
    }
    if (currentHash !== c.evidenceSha256) {
      const cls = classifyEvidenceHashChanged();
      out.push({
        driftType: "evidence_hash_changed",
        classification: cls,
        sourceTable: "ssp_evidence_citations",
        sourceRecordId: c.id,
        controlId: c.controlId,
        previousHash: c.evidenceSha256,
        currentHash,
        previousValueJson: {
          evidence_kind: c.evidenceKind,
          evidence_id: c.evidenceId,
        },
        currentValueJson: {
          evidence_kind: c.evidenceKind,
          evidence_id: c.evidenceId,
        },
        summary: `Evidence ${c.evidenceKind}:${c.evidenceId} refreshed since baseline.`,
      });
    }
  }
  return out;
}

/* ────────── Control-finding detector ────────────────────────────── */

async function detectControlFindingDrift(input: {
  organizationId: string;
  sections: Array<typeof sspSectionRevisions.$inferSelect>;
}): Promise<CandidateEvent[]> {
  const out: CandidateEvent[] = [];

  // Only control sections carry an aggregateFinding worth comparing.
  const controlSections = input.sections.filter(
    (s) => s.sectionKind === "control" && s.aggregateFinding != null,
  );
  if (controlSections.length === 0) return out;

  // Most-recent adjudication snapshot per (org, control_id) is the
  // current finding. Pull all of them for this org in one read,
  // then take latest by computed_at per controlId.
  const snapshots = await db
    .select({
      controlId: controlAdjudicationSnapshots.controlId,
      aggregateFinding: controlAdjudicationSnapshots.aggregateFinding,
      computedAt: controlAdjudicationSnapshots.computedAt,
    })
    .from(controlAdjudicationSnapshots)
    .where(
      eq(
        controlAdjudicationSnapshots.organizationId,
        input.organizationId,
      ),
    );

  const latestByControl = new Map<
    string,
    { aggregateFinding: string | null; computedAt: Date }
  >();
  for (const s of snapshots) {
    const prev = latestByControl.get(s.controlId);
    if (!prev || s.computedAt > prev.computedAt) {
      latestByControl.set(s.controlId, {
        aggregateFinding: s.aggregateFinding,
        computedAt: s.computedAt,
      });
    }
  }

  for (const sec of controlSections) {
    // section_key for control sections IS the control_id ("3.1.1").
    const controlId = sec.sectionKey;
    const pinned = (sec.aggregateFinding ?? "").toUpperCase();
    const current = (
      latestByControl.get(controlId)?.aggregateFinding ?? ""
    ).toUpperCase();

    // No current snapshot → can't classify; skip.
    if (!current) continue;
    if (pinned === current) continue;

    const cls = classifyControlFindingChange(pinned, current);
    const driftType =
      pinned === "MET" && current === "NOT_MET"
        ? "control_status_regressed"
        : current === "NA" && pinned !== "NA"
          ? "control_status_changed_na"
          : pinned === "NA" && current !== "NA"
            ? "control_status_left_na"
            : pinned === "NOT_MET" && current === "MET"
              ? "control_status_improved"
              : "control_status_wobble";

    out.push({
      driftType,
      classification: cls,
      sourceTable: "control_adjudication_snapshots",
      sourceRecordId: null,
      controlId,
      previousHash: null,
      currentHash: null,
      previousValueJson: { aggregate_finding: sec.aggregateFinding },
      currentValueJson: {
        aggregate_finding: latestByControl.get(controlId)?.aggregateFinding,
      },
      summary: `Control ${controlId} aggregate finding moved ${sec.aggregateFinding} → ${latestByControl.get(controlId)?.aggregateFinding}.`,
    });
  }

  return out;
}

/* ────────── Boundary-component detector ─────────────────────────── */

async function detectBoundaryComponentAdditions(input: {
  boundaryId: string;
  releasedAt: Date;
}): Promise<CandidateEvent[]> {
  const additions = await db
    .select({
      id: boundaryComponents.id,
      name: boundaryComponents.name,
      componentType: boundaryComponents.componentType,
      createdAt: boundaryComponents.createdAt,
    })
    .from(boundaryComponents)
    .where(
      and(
        eq(boundaryComponents.boundaryId, input.boundaryId),
        gt(boundaryComponents.createdAt, input.releasedAt),
      ),
    );

  return additions.map((c) => {
    const cls = classifyBoundaryComponentAdded();
    return {
      driftType: "boundary_component_added",
      classification: cls,
      sourceTable: "boundary_component",
      sourceRecordId: c.id,
      controlId: null,
      previousHash: null,
      currentHash: null,
      previousValueJson: null,
      currentValueJson: {
        name: c.name,
        component_type: c.componentType,
        created_at: c.createdAt.toISOString(),
      },
      summary: `Boundary component "${c.name}" (${c.componentType}) added since baseline release.`,
    };
  });
}

/* ────────── POA&M detector ──────────────────────────────────────── */

async function detectPoamDrift(input: {
  organizationId: string;
  sections: Array<typeof sspSectionRevisions.$inferSelect>;
  releasedAt: Date;
}): Promise<CandidateEvent[]> {
  // Build the list of control_ids the baseline cited.
  const controlIds = input.sections
    .filter((s) => s.sectionKind === "control")
    .map((s) => s.sectionKey);
  if (controlIds.length === 0) return [];

  // Map control_id (string) → control_record_id (uuid). poamEntries
  // FK to controlRecords.id, not to the canonical control_id string.
  const controlRecordRows = await db
    .select({
      id: controlRecords.id,
      controlId: controlRecords.controlId,
    })
    .from(controlRecords)
    .where(eq(controlRecords.organizationId, input.organizationId));

  const recordIdToControlId = new Map(
    controlRecordRows.map((r) => [r.id, r.controlId]),
  );
  const controlRecordIdsForBaseline = new Set(
    controlRecordRows
      .filter((r) => controlIds.includes(r.controlId))
      .map((r) => r.id),
  );
  if (controlRecordIdsForBaseline.size === 0) return [];

  // Pull POA&Ms tied to those control records that either opened or
  // closed after baseline release.
  const poamRows = await db
    .select({
      id: poamEntries.id,
      controlRecordId: poamEntries.controlRecordId,
      status: poamEntries.status,
      createdAt: poamEntries.createdAt,
      closedAt: poamEntries.closedAt,
      weaknessDescription: poamEntries.weaknessDescription,
    })
    .from(poamEntries)
    .where(eq(poamEntries.organizationId, input.organizationId));

  const out: CandidateEvent[] = [];
  for (const p of poamRows) {
    if (!controlRecordIdsForBaseline.has(p.controlRecordId)) continue;
    const controlId = recordIdToControlId.get(p.controlRecordId) ?? null;

    const openedAfter = p.createdAt > input.releasedAt;
    const closedAfter = p.closedAt != null && p.closedAt > input.releasedAt;

    if (closedAfter) {
      const cls = classifyPoamClosedPostBaseline();
      out.push({
        driftType: "poam_closed_post_baseline",
        classification: cls,
        sourceTable: "poam_entries",
        sourceRecordId: p.id,
        controlId,
        previousHash: null,
        currentHash: null,
        previousValueJson: { status: "open" },
        currentValueJson: {
          status: p.status,
          closed_at: p.closedAt?.toISOString() ?? null,
        },
        summary: `POA&M closed on ${controlId ?? p.controlRecordId} since baseline release.`,
      });
    } else if (openedAfter) {
      const cls = classifyPoamOpenedPostBaseline();
      out.push({
        driftType: "poam_opened_post_baseline",
        classification: cls,
        sourceTable: "poam_entries",
        sourceRecordId: p.id,
        controlId,
        previousHash: null,
        currentHash: null,
        previousValueJson: null,
        currentValueJson: {
          status: p.status,
          created_at: p.createdAt.toISOString(),
          weakness_description: p.weaknessDescription,
        },
        summary: `POA&M opened on ${controlId ?? p.controlRecordId} since baseline release.`,
      });
    }
  }

  return out;
}

/* ────────── Upsert ──────────────────────────────────────────────── */

async function upsertCandidates(input: {
  organizationId: string;
  baselineId: string;
  candidates: CandidateEvent[];
}): Promise<{ inserted: number; refreshed: number }> {
  let inserted = 0;
  let refreshed = 0;

  // The dedup index covers (baseline_id, drift_type, COALESCE(source_record_id,''),
  // COALESCE(control_id,'')) WHERE status='open'. We can't use Drizzle's
  // onConflict for partial unique indexes cleanly, so fall back to a
  // select-then-(update|insert) pair per candidate. The candidate set
  // is bounded by the number of cited controls + drifted evidence
  // citations + new boundary components + recent POA&Ms — typically
  // under a few hundred — so the round-trip cost is acceptable.
  for (const c of input.candidates) {
    const [existing] = await db
      .select({ id: sspBaselineDriftEvents.id })
      .from(sspBaselineDriftEvents)
      .where(
        and(
          eq(sspBaselineDriftEvents.baselineId, input.baselineId),
          eq(sspBaselineDriftEvents.driftType, c.driftType),
          eq(sspBaselineDriftEvents.status, "open"),
          c.sourceRecordId !== null
            ? eq(sspBaselineDriftEvents.sourceRecordId, c.sourceRecordId)
            : sql`${sspBaselineDriftEvents.sourceRecordId} IS NULL`,
          c.controlId !== null
            ? eq(sspBaselineDriftEvents.controlId, c.controlId)
            : sql`${sspBaselineDriftEvents.controlId} IS NULL`,
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(sspBaselineDriftEvents)
        .set({
          detectedAt: new Date(),
          currentHash: c.currentHash,
          currentValueJson: c.currentValueJson as never,
          severity: c.classification.severity,
          summary: c.summary,
          recommendation: c.classification.recommendation,
          requiresSspRedraft: c.classification.routing.requires_ssp_redraft,
          requiresPoamReview: c.classification.routing.requires_poam_review,
          requiresDocumentControlReview:
            c.classification.routing.requires_document_control_review,
          updatedAt: new Date(),
        })
        .where(eq(sspBaselineDriftEvents.id, existing.id));
      refreshed += 1;
    } else {
      await db.insert(sspBaselineDriftEvents).values({
        organizationId: input.organizationId,
        baselineId: input.baselineId,
        severity: c.classification.severity,
        driftType: c.driftType,
        status: "open",
        sourceTable: c.sourceTable,
        sourceRecordId: c.sourceRecordId,
        controlId: c.controlId,
        previousHash: c.previousHash,
        currentHash: c.currentHash,
        previousValueJson: c.previousValueJson as never,
        currentValueJson: c.currentValueJson as never,
        summary: c.summary,
        recommendation: c.classification.recommendation,
        requiresSspRedraft: c.classification.routing.requires_ssp_redraft,
        requiresPoamReview: c.classification.routing.requires_poam_review,
        requiresDocumentControlReview:
          c.classification.routing.requires_document_control_review,
      });
      inserted += 1;
    }
  }

  return { inserted, refreshed };
}

/* ────────── Adjudication mutations ──────────────────────────────── */

export interface AcknowledgeInput {
  organizationId: string;
  driftEventId: string;
  userId: string;
  notes?: string | null;
}

export async function acknowledgeDriftEvent(
  input: AcknowledgeInput,
): Promise<void> {
  await db
    .update(sspBaselineDriftEvents)
    .set({
      status: "acknowledged",
      acknowledgedAt: new Date(),
      acknowledgedByUserId: input.userId,
      adjudicationNotes: input.notes ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(sspBaselineDriftEvents.id, input.driftEventId),
        eq(sspBaselineDriftEvents.organizationId, input.organizationId),
        eq(sspBaselineDriftEvents.status, "open"),
      ),
    );
}

export interface DismissInput {
  organizationId: string;
  driftEventId: string;
  userId: string;
  /** Required per spec — dismissals must record a rationale. */
  rationale: string;
}

export async function dismissDriftEvent(input: DismissInput): Promise<void> {
  if (!input.rationale || input.rationale.trim().length === 0) {
    throw new Error(
      "dismissDriftEvent requires a non-empty rationale (spec: adjudication actions require rationale)",
    );
  }
  await db
    .update(sspBaselineDriftEvents)
    .set({
      status: "dismissed",
      adjudicatedAt: new Date(),
      adjudicatedByUserId: input.userId,
      adjudicationNotes: input.rationale,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(sspBaselineDriftEvents.id, input.driftEventId),
        eq(sspBaselineDriftEvents.organizationId, input.organizationId),
      ),
    );
}

export interface ResolveInput {
  organizationId: string;
  driftEventId: string;
  userId: string;
  notes?: string | null;
}

export async function resolveDriftEvent(input: ResolveInput): Promise<void> {
  await db
    .update(sspBaselineDriftEvents)
    .set({
      status: "resolved",
      adjudicatedAt: new Date(),
      adjudicatedByUserId: input.userId,
      adjudicationNotes: input.notes ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(sspBaselineDriftEvents.id, input.driftEventId),
        eq(sspBaselineDriftEvents.organizationId, input.organizationId),
      ),
    );
}

// Tx is exported so callers running inside their own transaction can
// pass it through; not used by the public functions above (which all
// run on the global db client) but reserved for future per-org batch
// operations that want stronger atomicity.
export type { Tx };
