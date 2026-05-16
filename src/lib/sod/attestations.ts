/**
 * Quarterly SoD attestations — typed helpers over the sod_matrix register.
 *
 * Phase 2C of AC.L2-3.1.4. A quarterly attestation is a periodic sign-off
 * by the responsible role owner that the current SoD state (matrix
 * snapshot + identities holding C-cell combinations) has been reviewed
 * and approved. It's stored as a sod_matrix_review register entry with
 * `entryData.source = "quarterly_attestation"` so it's distinguishable
 * from the auto-seeded entries created on MAC-POL-235 / MAC-SOP-235
 * Doc Control release (source = "doc_control_release").
 *
 * The `attested_principals` array on each entry names the identities
 * whose Compensating-cell role combinations are covered by the
 * attestation. The detective scan (`/api/sod/scan`) looks this up to
 * decide whether to flag a C-cell as `C_no_attestation` (medium) or
 * silently allow it (matrix says C, attestation covers it).
 */
import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  boundaries,
  governanceRegisters,
  governanceRegisterEntries,
} from "@/db/schema";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";
import { getRegisterSchemaByRegisterId } from "@/data/cmmc/register-schemas";
import { validateEntryData } from "@/lib/evidence-engine/validate-entry-data";

const REGISTER_SCHEMA_ID = "sod_matrix";
const ENTRY_TYPE = "sod_matrix_review";
const ATTESTATION_SOURCE = "quarterly_attestation";

/** Default freshness window for an attestation to "cover" a principal. */
const DEFAULT_FRESHNESS_DAYS = 100; // 90-day cadence + a 10-day grace window.

type Tx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface QuarterlyAttestationInput {
  organizationId: string;
  reviewerName: string;
  reviewerUserId: string | null;
  reviewPeriodStart: string; // yyyy-mm-dd
  reviewPeriodEnd: string;   // yyyy-mm-dd
  attestedPrincipals: string[];
  result: "no_change" | "exceptions_present";
  notes?: string;
}

export type CreateResult =
  | { kind: "created"; entryId: string }
  | { kind: "skipped"; reason: "no-register" | "no-boundary" | "no-schema" | "invalid" };

async function resolveRegisterAndBoundary(
  tx: Tx,
  organizationId: string,
): Promise<{ registerId: string; boundaryId: string } | { error: "no-register" | "no-boundary" }> {
  const cands = resolveRegisterKeyCandidates(REGISTER_SCHEMA_ID);
  const [register] = await tx
    .select({ id: governanceRegisters.id })
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.organizationId, organizationId),
        sql`${governanceRegisters.registerKey} IN (${sql.join(
          cands.map((k) => sql`${k}`),
          sql`, `,
        )})`,
      ),
    )
    .limit(1);
  if (!register) return { error: "no-register" };

  const [boundary] = await tx
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, organizationId))
    .limit(1);
  if (!boundary) return { error: "no-boundary" };

  return { registerId: register.id, boundaryId: boundary.id };
}

export async function createQuarterlyAttestation(
  tx: Tx,
  input: QuarterlyAttestationInput,
): Promise<CreateResult> {
  const resolved = await resolveRegisterAndBoundary(tx, input.organizationId);
  if ("error" in resolved) return { kind: "skipped", reason: resolved.error };

  const entryData: Record<string, unknown> = {
    review_period_start: input.reviewPeriodStart,
    review_period_end: input.reviewPeriodEnd,
    reviewer: input.reviewerName,
    reviewed_at: new Date().toISOString().slice(0, 10),
    result: input.result,
    notes:
      input.notes ??
      `Quarterly SoD attestation — ${input.attestedPrincipals.length} identity-set${
        input.attestedPrincipals.length === 1 ? "" : "s"
      } covered.`,
    // Custom provenance / context fields (additive — validator ignores
    // unknown keys per the seed-policy-review pattern).
    source: ATTESTATION_SOURCE,
    attested_principals: input.attestedPrincipals,
    attested_principals_count: input.attestedPrincipals.length,
  };

  const schema = getRegisterSchemaByRegisterId(REGISTER_SCHEMA_ID);
  const entryTypeSchema = schema?.entry_types.find((et) => et.type === ENTRY_TYPE);
  if (!entryTypeSchema) return { kind: "skipped", reason: "no-schema" };

  const validation = validateEntryData(entryTypeSchema, entryData);
  if (!validation.success) {
    console.error("[sod-attestation] entryData failed validation:", validation.fields);
    return { kind: "skipped", reason: "invalid" };
  }

  const now = new Date();
  const [entry] = await tx
    .insert(governanceRegisterEntries)
    .values({
      registerId: resolved.registerId,
      boundaryId: resolved.boundaryId,
      entryType: ENTRY_TYPE,
      status: "final",
      finalizedAt: now,
      entryData: validation.data,
      createdById: input.reviewerUserId,
      hold: 0,
    })
    .returning({ id: governanceRegisterEntries.id });

  return { kind: "created", entryId: entry.id };
}

export interface AttestationRow {
  id: string;
  reviewer: string | null;
  reviewedAt: string | null;
  reviewPeriodStart: string | null;
  reviewPeriodEnd: string | null;
  result: string | null;
  attestedPrincipals: string[];
  notes: string | null;
  finalizedAt: Date | null;
  createdAt: Date;
}

/**
 * Returns the set of principals currently covered by a recent quarterly
 * attestation (default 100-day window). Used by the detective scan to
 * suppress C-cell findings for covered identities.
 */
export async function getAttestedPrincipals(
  organizationId: string,
  freshnessDays: number = DEFAULT_FRESHNESS_DAYS,
): Promise<Set<string>> {
  const cands = resolveRegisterKeyCandidates(REGISTER_SCHEMA_ID);
  const rows = await db
    .select({
      attestedPrincipals: sql<unknown>`${governanceRegisterEntries.entryData}->'attested_principals'`,
      finalizedAt: governanceRegisterEntries.finalizedAt,
    })
    .from(governanceRegisterEntries)
    .innerJoin(
      governanceRegisters,
      eq(governanceRegisters.id, governanceRegisterEntries.registerId),
    )
    .where(
      and(
        eq(governanceRegisters.organizationId, organizationId),
        sql`${governanceRegisters.registerKey} IN (${sql.join(
          cands.map((k) => sql`${k}`),
          sql`, `,
        )})`,
        eq(governanceRegisterEntries.status, "final"),
        sql`${governanceRegisterEntries.entryData}->>'source' = ${ATTESTATION_SOURCE}`,
        sql`${governanceRegisterEntries.finalizedAt} > NOW() - INTERVAL '${sql.raw(`${freshnessDays} days`)}'`,
      ),
    );

  const out = new Set<string>();
  for (const row of rows) {
    const list = row.attestedPrincipals;
    if (Array.isArray(list)) {
      for (const p of list) {
        if (typeof p === "string") out.add(p);
      }
    }
  }
  return out;
}

/**
 * Lists recent quarterly attestations for the org, newest first. Drives
 * the Attestation tab UI.
 */
export async function listAttestations(
  organizationId: string,
  limit: number = 20,
): Promise<AttestationRow[]> {
  const cands = resolveRegisterKeyCandidates(REGISTER_SCHEMA_ID);
  const rows = await db
    .select({
      id: governanceRegisterEntries.id,
      entryData: governanceRegisterEntries.entryData,
      finalizedAt: governanceRegisterEntries.finalizedAt,
      createdAt: governanceRegisterEntries.createdAt,
    })
    .from(governanceRegisterEntries)
    .innerJoin(
      governanceRegisters,
      eq(governanceRegisters.id, governanceRegisterEntries.registerId),
    )
    .where(
      and(
        eq(governanceRegisters.organizationId, organizationId),
        sql`${governanceRegisters.registerKey} IN (${sql.join(
          cands.map((k) => sql`${k}`),
          sql`, `,
        )})`,
        eq(governanceRegisterEntries.status, "final"),
        sql`${governanceRegisterEntries.entryData}->>'source' = ${ATTESTATION_SOURCE}`,
      ),
    )
    .orderBy(desc(governanceRegisterEntries.finalizedAt))
    .limit(limit);

  return rows.map((r) => {
    const data = (r.entryData ?? {}) as Record<string, unknown>;
    const ap = data.attested_principals;
    return {
      id: r.id,
      reviewer: typeof data.reviewer === "string" ? data.reviewer : null,
      reviewedAt: typeof data.reviewed_at === "string" ? data.reviewed_at : null,
      reviewPeriodStart: typeof data.review_period_start === "string" ? data.review_period_start : null,
      reviewPeriodEnd: typeof data.review_period_end === "string" ? data.review_period_end : null,
      result: typeof data.result === "string" ? data.result : null,
      attestedPrincipals: Array.isArray(ap) ? ap.filter((p): p is string => typeof p === "string") : [],
      notes: typeof data.notes === "string" ? data.notes : null,
      finalizedAt: r.finalizedAt,
      createdAt: r.createdAt,
    };
  });
}

/**
 * Returns the most recent attestation's finalizedAt for this org, or
 * null if none exists. Used by the UI to compute "days since last" /
 * "due in N days".
 */
export async function getLastAttestationAt(organizationId: string): Promise<Date | null> {
  const cands = resolveRegisterKeyCandidates(REGISTER_SCHEMA_ID);
  const [row] = await db
    .select({ finalizedAt: governanceRegisterEntries.finalizedAt })
    .from(governanceRegisterEntries)
    .innerJoin(
      governanceRegisters,
      eq(governanceRegisters.id, governanceRegisterEntries.registerId),
    )
    .where(
      and(
        eq(governanceRegisters.organizationId, organizationId),
        sql`${governanceRegisters.registerKey} IN (${sql.join(
          cands.map((k) => sql`${k}`),
          sql`, `,
        )})`,
        eq(governanceRegisterEntries.status, "final"),
        sql`${governanceRegisterEntries.entryData}->>'source' = ${ATTESTATION_SOURCE}`,
      ),
    )
    .orderBy(desc(governanceRegisterEntries.finalizedAt))
    .limit(1);
  return row?.finalizedAt ?? null;
}
