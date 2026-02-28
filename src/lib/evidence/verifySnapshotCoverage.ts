/**
 * Verify snapshot coverage: recompute coverage hash and compare to stored value (tamper detection).
 */

import { eq, desc, and } from "drizzle-orm";
import { boundarySnapshots, evidenceRuns } from "@/db/schema";
import { computeEnclaveCoverage } from "@/lib/evidence/enclaveCoverage";
import { computeCoverageHash } from "@/lib/evidence/coverageHash";

export type VerifyReason =
  | "no_snapshot"
  | "no_coverage_attached"
  | "no_run_found"
  | "hash_mismatch"
  | "verified";

export interface VerifySnapshotCoverageResult {
  ok: boolean;
  reason?: VerifyReason;
  stored?: {
    coverageHash: string;
    runFingerprint: string;
    collectedAt: string;
    evidenceRunId: string;
    totals: unknown;
  };
  computed?: {
    coverageHash: string;
    totals: unknown;
  };
}

export async function verifySnapshotCoverage(params: {
  db: any;
  organizationId: string;
  accountId: string;
  boundaryId: string;
  snapshotId?: string;
  nowUtc?: string;
}): Promise<VerifySnapshotCoverageResult> {
  const { db, organizationId, accountId, boundaryId, snapshotId, nowUtc } = params;

  const snapshotRows = snapshotId
    ? await db
        .select()
        .from(boundarySnapshots)
        .where(
          and(
            eq(boundarySnapshots.snapshotId, snapshotId),
            eq(boundarySnapshots.accountId, accountId)
          )
        )
        .limit(1)
    : await db
        .select()
        .from(boundarySnapshots)
        .where(
          and(
            eq(boundarySnapshots.accountId, accountId),
            eq(boundarySnapshots.boundaryId, boundaryId)
          )
        )
        .orderBy(desc(boundarySnapshots.createdAt))
        .limit(1);

  const snapshot = snapshotRows[0] ?? null;
  if (!snapshot) {
    return { ok: false, reason: "no_snapshot" };
  }

  if (snapshot.coverageHash == null || snapshot.coverageHash === "") {
    return {
      ok: false,
      reason: "no_coverage_attached",
      stored: snapshot.coverageEvidenceRunId
        ? {
            coverageHash: "",
            runFingerprint: snapshot.coverageRunFingerprint ?? "",
            collectedAt: snapshot.coverageCollectedAt
              ? String(snapshot.coverageCollectedAt)
              : "",
            evidenceRunId: snapshot.coverageEvidenceRunId ?? "",
            totals: snapshot.coverageTotals ?? null,
          }
        : undefined,
    };
  }

  const evidenceRunId = snapshot.coverageEvidenceRunId;
  const runFingerprint = snapshot.coverageRunFingerprint;

  let runRow: { id: string; runFingerprint: string; collectedAt: Date | string } | null = null;
  if (evidenceRunId) {
    const runRows = await db
      .select({ id: evidenceRuns.id, runFingerprint: evidenceRuns.runFingerprint, collectedAt: evidenceRuns.collectedAt })
      .from(evidenceRuns)
      .where(eq(evidenceRuns.id, evidenceRunId))
      .limit(1);
    runRow = runRows[0] ?? null;
  }
  if (!runRow && runFingerprint) {
    const runRows = await db
      .select({ id: evidenceRuns.id, runFingerprint: evidenceRuns.runFingerprint, collectedAt: evidenceRuns.collectedAt })
      .from(evidenceRuns)
      .where(
        and(
          eq(evidenceRuns.organizationId, organizationId),
          eq(evidenceRuns.boundaryId, boundaryId),
          eq(evidenceRuns.runFingerprint, runFingerprint)
        )
      )
      .limit(1);
    runRow = runRows[0] ?? null;
  }

  if (!runRow) {
    return {
      ok: false,
      reason: "no_run_found",
      stored: {
        coverageHash: snapshot.coverageHash,
        runFingerprint: snapshot.coverageRunFingerprint ?? "",
        collectedAt: snapshot.coverageCollectedAt ? String(snapshot.coverageCollectedAt) : "",
        evidenceRunId: snapshot.coverageEvidenceRunId ?? "",
        totals: snapshot.coverageTotals ?? null,
      },
    };
  }

  const source = snapshot.coverageSource ?? "windows_server_hardening";
  const summary = await computeEnclaveCoverage({
    db,
    organizationId,
    accountId,
    boundaryId,
    evidenceRunId: runRow.id,
    source,
    nowUtc,
  });
  const computedHash = computeCoverageHash(summary);
  const storedHash = snapshot.coverageHash;

  if (computedHash !== storedHash) {
    return {
      ok: false,
      reason: "hash_mismatch",
      stored: {
        coverageHash: storedHash,
        runFingerprint: snapshot.coverageRunFingerprint ?? "",
        collectedAt: snapshot.coverageCollectedAt ? String(snapshot.coverageCollectedAt) : "",
        evidenceRunId: snapshot.coverageEvidenceRunId ?? "",
        totals: snapshot.coverageTotals ?? null,
      },
      computed: { coverageHash: computedHash, totals: summary.totals },
    };
  }

  return {
    ok: true,
    reason: "verified",
    stored: {
      coverageHash: storedHash,
      runFingerprint: snapshot.coverageRunFingerprint ?? "",
      collectedAt: snapshot.coverageCollectedAt ? String(snapshot.coverageCollectedAt) : "",
      evidenceRunId: snapshot.coverageEvidenceRunId ?? "",
      totals: snapshot.coverageTotals ?? null,
    },
    computed: { coverageHash: computedHash, totals: summary.totals },
  };
}
