/**
 * Continuous Monitoring (ConMon): controls due for review and evidence expiring soon.
 */

import { db } from "@/db";
import { controlRecords, evidenceMetadata } from "@/db/schema";
import { eq, lte, and } from "drizzle-orm";

const CADENCE_DAYS: Record<string, number> = {
  Monthly: 30,
  Quarterly: 90,
  Annual: 365,
};

/**
 * For a given lastValidationDate and monitoringCadence, return the next due date (as Date).
 * If lastValidationDate is null, treat as "due now" (return past date).
 */
function nextDueDate(
  lastValidationDate: Date | null,
  monitoringCadence: string | null
): Date {
  if (!lastValidationDate || !monitoringCadence) return new Date(0); // due immediately
  const days = CADENCE_DAYS[monitoringCadence] ?? 90;
  const next = new Date(lastValidationDate);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * Controls due for review: lastValidationDate + cadence is in the past or within 30 days.
 * Also includes controls with no cadence set (optional: show as "Set review schedule").
 */
export async function getControlsDueForReview(organizationId: string) {
  const records = await db
    .select({
      id: controlRecords.id,
      controlId: controlRecords.controlId,
      lastValidationDate: controlRecords.lastValidationDate,
      monitoringCadence: controlRecords.monitoringCadence,
    })
    .from(controlRecords)
    .where(eq(controlRecords.organizationId, organizationId));

  const now = new Date();
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + 30);

  return records.filter((r) => {
    const nextDue = nextDueDate(
      r.lastValidationDate ? new Date(r.lastValidationDate) : null,
      r.monitoringCadence
    );
    return nextDue <= windowEnd;
  });
}

/**
 * Evidence metadata entries whose retentionUntil is within the next 30 days (or already passed).
 */
export async function getEvidenceExpiringSoon(organizationId: string) {
  const now = new Date();
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + 30);

  return db
    .select({
      id: evidenceMetadata.id,
      evidenceId: evidenceMetadata.evidenceId,
      artifactFilename: evidenceMetadata.artifactFilename,
      retentionUntil: evidenceMetadata.retentionUntil,
    })
    .from(evidenceMetadata)
    .where(
      and(
        eq(evidenceMetadata.organizationId, organizationId),
        lte(evidenceMetadata.retentionUntil, windowEnd)
      )
    );
}
