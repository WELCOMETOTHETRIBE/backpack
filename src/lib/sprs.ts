import { db } from "@/db";
import { controlRecords, organizations } from "@/db/schema";
import { eq, max as sqlMax } from "drizzle-orm";
import {
  calculateSprsScore,
  sprsScoringData,
  type ControlImplementation,
} from "./sprs/index";
import { notifyCaptureOsOfSprsChange } from "./captureos-bridge";

/**
 * Computes SPRS score from controlRecords, persists to organizations.sprsScore, and returns the score.
 * Call on every control implementationStatus change (Governance Wizard, Technical Config, Assessor).
 */
export async function computeAndPersistSprsScore(
  organizationId: string
): Promise<number> {
  const records = await db
    .select({
      controlId: controlRecords.controlId,
      implementationStatus: controlRecords.implementationStatus,
      sprs31311Condition: controlRecords.sprs31311Condition,
    })
    .from(controlRecords)
    .where(eq(controlRecords.organizationId, organizationId));

  // SPRS-credited statuses per DoD Assessment Methodology + CMMC Scoping
  // Guidance: "implemented", "assessed", and "inherited" are met; "not_applicable"
  // controls properly tailored out via scoping are also treated as met (no
  // deduction). Anything else (not_started, in_progress, etc.) deducts.
  const isSprsCredited = (s: string | null | undefined) =>
    s === "implemented" || s === "assessed" || s === "inherited" || s === "not_applicable";

  const implementations: ControlImplementation[] = records.map((r) => ({
    controlId: r.controlId,
    isImplemented: isSprsCredited(r.implementationStatus),
  }));

  const record31311 = records.find((r) => r.controlId === "3.13.11");
  const controlDeductionOverrides: Record<string, number> = {};
  if (
    record31311 &&
    !isSprsCredited(record31311.implementationStatus) &&
    record31311.sprs31311Condition === "non_fips"
  ) {
    controlDeductionOverrides["3.13.11"] = 3;
  }

  const score = calculateSprsScore(
    implementations,
    Object.keys(controlDeductionOverrides).length > 0
      ? controlDeductionOverrides
      : undefined
  );

  await db
    .update(organizations)
    .set({ sprsScore: score })
    .where(eq(organizations.id, organizationId));

  // Fire-and-forget push to CaptureOS so its eligibility chips refresh
  // without waiting for the daily 0610 ET pull. Non-fatal: if CaptureOS
  // is down, the safety-net beat will reconcile within 24h.
  void pushSprsToCaptureOs(organizationId, score);

  return score;
}

async function pushSprsToCaptureOs(
  organizationId: string,
  score: number,
): Promise<void> {
  try {
    const [org] = await db
      .select({
        clerkOrgId: organizations.clerkOrgId,
      })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org?.clerkOrgId) return; // not a Clerk-tenant; nothing to notify

    const [latestAssessment] = await db
      .select({ latest: sqlMax(controlRecords.assessmentDate) })
      .from(controlRecords)
      .where(eq(controlRecords.organizationId, organizationId));

    await notifyCaptureOsOfSprsChange({
      clerkOrgId: org.clerkOrgId,
      score,
      max: 110,
      assessmentDate: latestAssessment?.latest ?? null,
      reason: "sprs_recomputed",
    });
  } catch (err) {
    // Swallow — notify path is non-fatal by design.
    console.warn("[captureos-bridge] sprs notify failed:", err);
  }
}

/**
 * Returns the current SPRS score for an organization (persisted). Backfills once if null.
 */
export async function getSprsScore(organizationId: string): Promise<number> {
  const [org] = await db
    .select({ sprsScore: organizations.sprsScore })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!org) throw new Error("Organization not found");
  if (org.sprsScore != null) return org.sprsScore;

  return computeAndPersistSprsScore(organizationId);
}

/**
 * Returns points lost per family for dashboard breakdown. Uses current controlRecords.
 */
export async function getSprsBreakdown(
  organizationId: string
): Promise<{ family: string; pointsLost: number }[]> {
  const records = await db
    .select({
      controlId: controlRecords.controlId,
      implementationStatus: controlRecords.implementationStatus,
      sprs31311Condition: controlRecords.sprs31311Condition,
    })
    .from(controlRecords)
    .where(eq(controlRecords.organizationId, organizationId));

  const isSprsCredited = (s: string | null | undefined) =>
    s === "implemented" || s === "assessed" || s === "inherited" || s === "not_applicable";

  const implementedIds = new Set(
    records.filter((r) => isSprsCredited(r.implementationStatus)).map((r) => r.controlId)
  );

  const record31311 = records.find((r) => r.controlId === "3.13.11");
  const deduction31311 =
    record31311 &&
    !isSprsCredited(record31311.implementationStatus) &&
    record31311.sprs31311Condition === "non_fips"
      ? 3
      : 5;

  const byFamily = new Map<string, number>();
  for (const control of sprsScoringData) {
    if (implementedIds.has(control.id)) continue;
    const deduction =
      control.id === "3.13.11" ? deduction31311 : control.value;
    byFamily.set(
      control.family,
      (byFamily.get(control.family) ?? 0) + deduction
    );
  }

  return Array.from(byFamily.entries())
    .map(([family, pointsLost]) => ({ family, pointsLost }))
    .sort((a, b) => a.family.localeCompare(b.family));
}

export {
  calculateSprsScore,
  sprsScoringData,
  SPRS_MAX,
  SPRS_MIN,
  SPRS_RANGE,
} from "./sprs/index";
export type { ControlImplementation, SprsControlScore } from "./sprs/index";
