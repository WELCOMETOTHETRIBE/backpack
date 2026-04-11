import { NextResponse } from "next/server";
import { db } from "@/db";
import { controlRecords, controlRecordHistory } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { calculateControlStatus } from "@/lib/control-status";
import { computeAndPersistSprsScore } from "@/lib/sprs";

const VALID_STATUSES = [
  "not_started",
  "in_progress",
  "implemented",
  "assessed",
  "inherited",
  "not_applicable",
] as const;

const VALID_TECHNICAL_STATUSES = ["not_started", "satisfied", "failed", "not_applicable"] as const;
const VALID_POLICY_STATUSES = ["not_required", "required", "missing", "satisfied"] as const;

const VALID_CADENCES = ["Quarterly", "Monthly", "Annual"] as const;
const VALID_VALIDATION_METHODS = ["examine", "interview", "test", "combination"] as const;

/**
 * PATCH /api/control-records/:id
 * Admin/Compliance only — Assessors are read-only.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await requireOrg();
    // Assessors are strictly read-only — they may not mutate control records.
    const user = await requireRole(["Admin", "Compliance"]);
    const { id } = await params;

    const [existing] = await db
      .select()
      .from(controlRecords)
      .where(and(eq(controlRecords.id, id), eq(controlRecords.organizationId, orgId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const updates: Partial<typeof controlRecords.$inferInsert> = {};

    if (typeof body.governanceNarrative !== "undefined")
      updates.governanceNarrative = body.governanceNarrative ?? null;

    if (typeof body.responsibleRoleId !== "undefined")
      updates.responsibleRoleId = body.responsibleRoleId ?? null;

    if (typeof body.hybridSatisfaction !== "undefined") {
      updates.hybridSatisfaction =
        body.hybridSatisfaction != null && typeof body.hybridSatisfaction === "object"
          ? {
              technical: Boolean(body.hybridSatisfaction.technical),
              governance: Boolean(body.hybridSatisfaction.governance),
            }
          : null;
    }

    if (existing.controlId === "3.13.11" && typeof body.sprs31311Condition !== "undefined") {
      const v = body.sprs31311Condition;
      updates.sprs31311Condition = v === "no_crypto" || v === "non_fips" ? v : null;
    }

    if (typeof body.lastValidationDate !== "undefined") {
      updates.lastValidationDate = body.lastValidationDate ? new Date(body.lastValidationDate) : null;
    }

    if (
      typeof body.monitoringCadence === "string" &&
      VALID_CADENCES.includes(body.monitoringCadence as (typeof VALID_CADENCES)[number])
    ) {
      updates.monitoringCadence = body.monitoringCadence as (typeof VALID_CADENCES)[number];
    } else if (body.monitoringCadence === null) {
      updates.monitoringCadence = null;
    }

    if (
      typeof body.validationMethod === "string" &&
      VALID_VALIDATION_METHODS.includes(body.validationMethod as (typeof VALID_VALIDATION_METHODS)[number])
    ) {
      updates.validationMethod = body.validationMethod;
    } else if (body.validationMethod === null) {
      updates.validationMethod = null;
    }

    if (
      typeof body.implementationStatus === "string" &&
      VALID_STATUSES.includes(body.implementationStatus as (typeof VALID_STATUSES)[number])
    ) {
      updates.implementationStatus = body.implementationStatus as (typeof VALID_STATUSES)[number];
    }

    // ── Dual-evidence lane fields ──
    if (
      typeof body.technicalStatus === "string" &&
      VALID_TECHNICAL_STATUSES.includes(body.technicalStatus as (typeof VALID_TECHNICAL_STATUSES)[number])
    ) {
      updates.technicalStatus = body.technicalStatus;
    }

    if (
      typeof body.policyStatus === "string" &&
      VALID_POLICY_STATUSES.includes(body.policyStatus as (typeof VALID_POLICY_STATUSES)[number])
    ) {
      updates.policyStatus = body.policyStatus;
      // Stamp policyDocLinkedAt when marking satisfied; clear when un-satisfying
      if (body.policyStatus === "satisfied") {
        updates.policyDocLinkedAt = new Date();
      } else if (existing.policyStatus === "satisfied") {
        updates.policyDocLinkedAt = null;
      }
    }

    if (typeof body.policyDocNarrative !== "undefined") {
      updates.policyDocNarrative = body.policyDocNarrative ?? null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(existing);
    }

    // Write field-level audit trail for non-status fields
    if (user.id) {
      for (const [fieldName, newVal] of Object.entries(updates)) {
        if (fieldName === "implementationStatus") continue;
        const oldVal = existing[fieldName as keyof typeof existing];
        const oldStr = oldVal != null ? String(oldVal) : null;
        const newStr = newVal != null ? String(newVal) : null;
        if (oldStr !== newStr) {
          await db.insert(controlRecordHistory).values({
            controlRecordId: id,
            changedById: user.id,
            fieldName,
            oldValue: oldStr,
            newValue: newStr,
          });
        }
      }
      // Also log status changes explicitly
      if (
        "implementationStatus" in updates &&
        existing.implementationStatus !== updates.implementationStatus
      ) {
        await db.insert(controlRecordHistory).values({
          controlRecordId: id,
          changedById: user.id,
          fieldName: "implementationStatus",
          oldValue: existing.implementationStatus,
          newValue: updates.implementationStatus ?? null,
        });
      }
      if ("technicalStatus" in updates && existing.technicalStatus !== updates.technicalStatus) {
        await db.insert(controlRecordHistory).values({
          controlRecordId: id,
          changedById: user.id,
          fieldName: "technicalStatus",
          oldValue: existing.technicalStatus,
          newValue: updates.technicalStatus ?? null,
        });
      }
      if ("policyStatus" in updates && existing.policyStatus !== updates.policyStatus) {
        await db.insert(controlRecordHistory).values({
          controlRecordId: id,
          changedById: user.id,
          fieldName: "policyStatus",
          oldValue: existing.policyStatus,
          newValue: updates.policyStatus ?? null,
        });
      }
    }

    await db
      .update(controlRecords)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(controlRecords.id, id));

    if (!("implementationStatus" in updates)) {
      await calculateControlStatus(id);
    }
    if ("sprs31311Condition" in updates) {
      await computeAndPersistSprsScore(existing.organizationId);
    }

    const [updated] = await db
      .select()
      .from(controlRecords)
      .where(eq(controlRecords.id, id))
      .limit(1);

    return NextResponse.json(updated ?? existing);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update control record";
    const status =
      message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
