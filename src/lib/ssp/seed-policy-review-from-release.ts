/**
 * Auto-seed the SSP & Policy Review register from a Doc Control release.
 *
 * Trust Codex submits an SSP to QMS Doc Control; QMS reviews, signs,
 * and pushes the release back via the governance manifest. The QMS
 * release IS the "policy reviewed & approved" event — its SHA-pinned
 * manifest entry is the cryptographic record of human approval. Until
 * this module existed, the corresponding register entry had to be
 * created by hand, which meant the register could silently drift from
 * the QMS state.
 *
 * On every release event, this helper:
 *   1. Resolves the org's `policy_review_log` register (accepting either
 *      vocabulary via register-key-aliases).
 *   2. Resolves the org's single boundary (Trust Codex is 1-boundary-per-org).
 *   3. Idempotency-checks against `entry_data->>'source_submission_id'`.
 *   4. Inserts one finalized `policy_review_completed` entry stamped with
 *      the QMS document number, sha256, release date, and the system
 *      reviewer label.
 *   5. (Post-txn) Recomputes every control_record whose registerSchemaId
 *      resolves to `policy_review` — in practice 3.12.4, but driven off
 *      CONTROL_INTELLIGENCE so it stays correct if the dataset grows.
 *
 * Reviewer attribution is a system label, not a human name, because the
 * QMS manifest doesn't carry the approver identity today. The defensible
 * evidence of approval is the SHA-pinned QMS doc number — the reviewer
 * string is metadata. If QMS later starts exporting the approver name,
 * swap the label without changing the contract.
 */
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  boundaries,
  controlRecords,
  governanceRegisters,
  governanceRegisterEntries,
  sspDocuments,
} from "@/db/schema";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";
import { getRegisterSchemaByRegisterId } from "@/data/cmmc/register-schemas";
import { getControlsForRegister } from "@/data/cmmc/control-intelligence";
import { validateEntryData } from "@/lib/evidence-engine/validate-entry-data";
import { calculateControlStatus } from "@/lib/control-status";

const REGISTER_SCHEMA_ID = "policy_review";
const ENTRY_TYPE = "policy_review_completed";
const REVIEWER_LABEL = "Quality Doc Control (QMS-attested)";

type Tx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type SeedResult =
  | { kind: "created"; entryId: string }
  | { kind: "duplicate"; entryId: string }
  | { kind: "skipped"; reason: "no-register" | "no-boundary" | "no-schema" | "invalid" };

export interface SeedInput {
  organizationId: string;
  sspDocumentId: string;
  sspDocControlSubmissionId: string;
  qmsDocumentNumber: string;
  qmsSha256: string;
  releasedAt: Date;
}

export async function seedPolicyReviewEntryFromRelease(
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

  const [existing] = await tx
    .select({ id: governanceRegisterEntries.id })
    .from(governanceRegisterEntries)
    .where(
      and(
        eq(governanceRegisterEntries.registerId, register.id),
        sql`${governanceRegisterEntries.entryData}->>'source_submission_id' = ${args.sspDocControlSubmissionId}`,
      ),
    )
    .limit(1);
  if (existing) return { kind: "duplicate", entryId: existing.id };

  const [sspDoc] = await tx
    .select({ createdAt: sspDocuments.createdAt })
    .from(sspDocuments)
    .where(eq(sspDocuments.id, args.sspDocumentId))
    .limit(1);
  const periodStart = (sspDoc?.createdAt ?? args.releasedAt).toISOString().slice(0, 10);
  const releaseDay = args.releasedAt.toISOString().slice(0, 10);

  const entryData: Record<string, unknown> = {
    policy_id: "SSP",
    policy_name: `System Security Plan (${args.qmsDocumentNumber})`,
    review_period_start: periodStart,
    review_period_end: releaseDay,
    reviewed_at: releaseDay,
    reviewed_by: REVIEWER_LABEL,
    // The policy_review_completed schema's `result` enum models what
    // happened to the document during review (no_change | updated |
    // retired | superseded), not approval state. A QMS release event
    // is by definition a new version of the SSP — `updated` is the
    // correct value; approval is implicit in the release itself.
    result: "updated",
    changes_summary: `SSP released by Quality Doc Control as ${args.qmsDocumentNumber}.`,
    source: "doc_control_release",
    source_submission_id: args.sspDocControlSubmissionId,
    qms_document_number: args.qmsDocumentNumber,
    qms_sha256: args.qmsSha256,
  };

  const schema = getRegisterSchemaByRegisterId(REGISTER_SCHEMA_ID);
  const entryTypeSchema = schema?.entry_types.find((et) => et.type === ENTRY_TYPE);
  if (!entryTypeSchema) return { kind: "skipped", reason: "no-schema" };

  const validation = validateEntryData(entryTypeSchema, entryData);
  if (!validation.success) {
    console.error(
      `[seed-policy-review] entryData failed schema validation for SSP-release ${args.qmsDocumentNumber}:`,
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
 * on policy_review_log. Call this after a policy_review entry is seeded
 * (or otherwise written) so dashboard implementation_status reflects the
 * new evidence without waiting for lazy on-read recomputation.
 *
 * Returns the count successfully recalculated. Errors per control are
 * swallowed and logged — one bad control must not stop the others.
 */
export async function recomputePolicyReviewAffectedControls(
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
