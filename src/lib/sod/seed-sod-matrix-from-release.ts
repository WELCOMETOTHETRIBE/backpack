/**
 * Auto-seed the sod_matrix register from a Doc Control release of MAC-SOP-235.
 *
 * Same pattern as `seed-policy-review-from-release.ts` (which seeds the
 * policy_review register from SSP releases). MAC-SOP-235 is the
 * authoritative Separation of Duties Matrix; on its release through QMS
 * Doc Control, Trust Codex records the release as a `sod_matrix_review`
 * register entry so 3.1.4's register lane reflects the reviewed state
 * without manual operator action.
 *
 * Reviewer attribution is system-attributed ("Quality Doc Control
 * (QMS-attested)") because the QMS manifest carries no human approver
 * field; the SHA-pinned qms_document_number is the cryptographic
 * evidence of approval — same defensibility model as the SSP path.
 */
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  boundaries,
  controlRecords,
  governanceRegisters,
  governanceRegisterEntries,
} from "@/db/schema";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";
import { getRegisterSchemaByRegisterId } from "@/data/cmmc/register-schemas";
import { getControlsForRegister } from "@/data/cmmc/control-intelligence";
import { validateEntryData } from "@/lib/evidence-engine/validate-entry-data";
import { calculateControlStatus } from "@/lib/control-status";

const REGISTER_SCHEMA_ID = "sod_matrix";
const ENTRY_TYPE = "sod_matrix_review";
const REVIEWER_LABEL = "Quality Doc Control (QMS-attested)";

/**
 * Doc numbers that, when released by Doc Control, trigger a sod_matrix_review
 * seed.
 *
 * MAC-POL-235 is the parent policy (workflow-level personnel SoD across
 * MacTech: PRs, ISAs, RAs, QMS Doc Control, PIM, maintenance, access,
 * audit log review). MAC-SOP-235 is the Windows Server 2025 enclave
 * operational appendix (R1–R10 admin role matrix). Per MAC-POL-210
 * §8.1: "On release of either, Trust Codex auto-seeds a
 * sod_matrix_review register entry as the operational evidence of
 * review." Both rolls up to AC.L2-3.1.4 in Codex.
 */
export const SOD_MATRIX_TRIGGER_DOC_NUMBERS = new Set([
  "MAC-POL-235",
  "MAC-SOP-235",
]);

type Tx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type SeedResult =
  | { kind: "created"; entryId: string }
  | { kind: "duplicate"; entryId: string }
  | { kind: "skipped"; reason: "no-register" | "no-boundary" | "no-schema" | "invalid" };

export interface SeedInput {
  organizationId: string;
  qmsDocumentNumber: string;
  qmsSha256: string;
  releasedAt: Date;
  /** Previous-release date for review_period_start. Null on first release; helper falls back to releasedAt-365d. */
  previousReleasedAt: Date | null;
}

export async function seedSodMatrixReviewFromRelease(
  tx: Tx,
  args: SeedInput,
): Promise<SeedResult> {
  const cands = resolveRegisterKeyCandidates(REGISTER_SCHEMA_ID);
  const [register] = await tx
    .select({ id: governanceRegisters.id })
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.organizationId, args.organizationId),
        sql`${governanceRegisters.registerKey} IN (${sql.join(
          cands.map((k) => sql`${k}`),
          sql`, `,
        )})`,
      ),
    )
    .limit(1);
  if (!register) return { kind: "skipped", reason: "no-register" };

  const [boundary] = await tx
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, args.organizationId))
    .limit(1);
  if (!boundary) return { kind: "skipped", reason: "no-boundary" };

  // Idempotency: (qms_document_number, qms_sha256) uniquely identifies a
  // released revision. Re-ingesting the same manifest is a no-op.
  const [existing] = await tx
    .select({ id: governanceRegisterEntries.id })
    .from(governanceRegisterEntries)
    .where(
      and(
        eq(governanceRegisterEntries.registerId, register.id),
        sql`${governanceRegisterEntries.entryData}->>'qms_document_number' = ${args.qmsDocumentNumber}`,
        sql`${governanceRegisterEntries.entryData}->>'qms_sha256' = ${args.qmsSha256}`,
      ),
    )
    .limit(1);
  if (existing) return { kind: "duplicate", entryId: existing.id };

  const releaseDay = args.releasedAt.toISOString().slice(0, 10);
  const prevReleased = args.previousReleasedAt ?? new Date(args.releasedAt.getTime() - 365 * 24 * 60 * 60 * 1000);
  const periodStart = prevReleased.toISOString().slice(0, 10);

  const entryData: Record<string, unknown> = {
    review_period_start: periodStart,
    review_period_end: releaseDay,
    reviewed_at: releaseDay,
    reviewer: REVIEWER_LABEL,
    // `result` enum: no_change | updated | exceptions_present. A QMS
    // re-release of MAC-SOP-235 represents an updated matrix by definition;
    // operators who want to record "no_change" can do so manually via the
    // register UI without going through Doc Control.
    result: "updated",
    notes: `MAC-SOP-235 released by Quality Doc Control as ${args.qmsDocumentNumber}.`,
    source: "doc_control_release",
    qms_document_number: args.qmsDocumentNumber,
    qms_sha256: args.qmsSha256,
  };

  const schema = getRegisterSchemaByRegisterId(REGISTER_SCHEMA_ID);
  const entryTypeSchema = schema?.entry_types.find((et) => et.type === ENTRY_TYPE);
  if (!entryTypeSchema) return { kind: "skipped", reason: "no-schema" };

  const validation = validateEntryData(entryTypeSchema, entryData);
  if (!validation.success) {
    console.error(
      `[seed-sod-matrix] entryData failed schema validation for ${args.qmsDocumentNumber}:`,
      validation.fields,
    );
    return { kind: "skipped", reason: "invalid" };
  }

  const [entry] = await tx
    .insert(governanceRegisterEntries)
    .values({
      registerId: register.id,
      boundaryId: boundary.id,
      entryType: ENTRY_TYPE,
      status: "final",
      finalizedAt: args.releasedAt,
      entryData: validation.data,
      createdById: null,
      hold: 0,
    })
    .returning({ id: governanceRegisterEntries.id });

  return { kind: "created", entryId: entry.id };
}

/**
 * Recompute every control_record in the org whose register lane depends
 * on sod_matrix (currently 3.1.4). Best-effort.
 */
export async function recomputeSodMatrixAffectedControls(
  organizationId: string,
): Promise<{ recalculated: number; errors: string[] }> {
  const errors: string[] = [];
  const affectedControlIds = getControlsForRegister(REGISTER_SCHEMA_ID).map((c) => c.controlId);
  if (affectedControlIds.length === 0) return { recalculated: 0, errors };

  const recs = await db
    .select({ id: controlRecords.id, controlId: controlRecords.controlId })
    .from(controlRecords)
    .where(
      and(
        eq(controlRecords.organizationId, organizationId),
        inArray(controlRecords.controlId, affectedControlIds),
      ),
    );

  let recalculated = 0;
  for (const r of recs) {
    try {
      await calculateControlStatus(r.id);
      recalculated += 1;
    } catch (err) {
      errors.push(
        `${r.controlId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return { recalculated, errors };
}
