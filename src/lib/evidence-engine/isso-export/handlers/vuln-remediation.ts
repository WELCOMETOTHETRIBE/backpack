/**
 * vuln_remediation handler — v1.1 ISSO export §4.7.
 *
 * The ISSO confirms the observed status of vuln findings during weekly
 * review. Each item lands as a `verification_observed` entry on the
 * vuln_remediation register, idempotent on (vuln_id, observed_at).
 *
 * Backs §3.4.4, §3.11.2, §3.11.3, §3.14.1.
 */

import { db } from "@/db";
import {
  boundaries,
  governanceRegisters,
  governanceRegisterEntries,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";
import type { HandlerResult, IngestContext, RegisterHandler } from "../types";

const COVERED = ["3.4.4", "3.11.2", "3.11.3", "3.14.1"] as const;

type ObservedStatus = "remediated" | "in_progress" | "risk_accepted" | "regressed";

interface VerificationItem {
  vuln_id?: string;
  asset?: string;
  status_observed?: ObservedStatus | string;
  notes?: string | null;
  ticket?: string | null;
}

interface VulnRemediationPayload {
  verifications?: VerificationItem[];
}

export const vuln_remediationHandler: RegisterHandler = async (
  ctx: IngestContext,
  payload: unknown,
): Promise<HandlerResult> => {
  const result: HandlerResult = {
    section: "vuln_remediation",
    entries_inserted: 0,
    entries_updated: 0,
    controls_touched: [],
    warnings: [],
  };

  const verifications = ((payload ?? {}) as VulnRemediationPayload).verifications ?? [];
  if (verifications.length === 0) return result;

  const [primaryBoundary] = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, ctx.orgId))
    .limit(1);
  if (!primaryBoundary) {
    result.warnings.push("no primary boundary for org — verifications not written");
    return result;
  }

  const candidates = resolveRegisterKeyCandidates("vuln_remediation");
  const matchingRegisters = await db
    .select({ id: governanceRegisters.id })
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

  if (matchingRegisters.length === 0) {
    result.warnings.push("vuln_remediation register not provisioned for org");
    return result;
  }

  let targetRegisterId = matchingRegisters[0].id;
  if (matchingRegisters.length > 1) {
    const counts = await Promise.all(
      matchingRegisters.map(async (r) => {
        const [c] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(governanceRegisterEntries)
          .where(eq(governanceRegisterEntries.registerId, r.id));
        return { id: r.id, n: c?.n ?? 0 };
      }),
    );
    counts.sort((a, b) => b.n - a.n);
    targetRegisterId = counts[0].id;
  }

  const observedAtIso = ctx.reviewPeriodEnd.toISOString();
  const observedBy = "ISSO weekly review";
  const now = new Date();

  for (const v of verifications) {
    if (!v.vuln_id || !v.asset || !v.status_observed) {
      result.warnings.push(
        `verification missing vuln_id/asset/status_observed — skipped`,
      );
      continue;
    }

    const entryData: Record<string, unknown> = {
      vuln_id: v.vuln_id,
      asset: v.asset,
      status_observed: v.status_observed,
      observed_at: observedAtIso,
      observed_by: observedBy,
      notes: v.notes ?? null,
      ticket: v.ticket ?? null,
      manifest_id: ctx.manifestId,
      vault_id: ctx.vaultId,
    };

    // Idempotent on (vuln_id, observed_at) — same review period producing
    // the same verification is a no-op replace, not a duplicate row.
    const [existing] = await db
      .select({ id: governanceRegisterEntries.id })
      .from(governanceRegisterEntries)
      .where(
        and(
          eq(governanceRegisterEntries.registerId, targetRegisterId),
          eq(governanceRegisterEntries.entryType, "verification_observed"),
          sql`${governanceRegisterEntries.entryData} ->> 'vuln_id' = ${v.vuln_id}`,
          sql`${governanceRegisterEntries.entryData} ->> 'observed_at' = ${observedAtIso}`,
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(governanceRegisterEntries)
        .set({
          entryData,
          status: "final",
          finalizedAt: now,
          updatedAt: now,
        })
        .where(eq(governanceRegisterEntries.id, existing.id));
      result.entries_updated++;
    } else {
      await db.insert(governanceRegisterEntries).values({
        registerId: targetRegisterId,
        boundaryId: primaryBoundary.id,
        entryData,
        entryType: "verification_observed",
        status: "final",
        finalizedAt: now,
      });
      result.entries_inserted++;
    }
  }

  result.controls_touched = [...COVERED];
  return result;
};
