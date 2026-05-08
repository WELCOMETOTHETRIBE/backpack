/**
 * GET /api/ir-tabletop/bundles
 *
 * Read-only metadata feed for the EnclaveWatch vault-side viewer. Returns
 * one row per IR tabletop bundle for the caller's org, scoped to bundles
 * created since `?since=<ISO-8601>` (default: 90 days ago).
 *
 * Auth: bearer token matching organizations.enclavewatch_api_token —
 * same pattern as the existing EnclaveWatch ingest endpoints. Public
 * route per src/middleware.ts allowlist for /api/ir-tabletop(.*) so
 * Clerk doesn't rewrite to /clerk_*.
 *
 * What this returns: signed-summary fields the vault already holds in
 * its own copy of the bundle. NO CUI fields are proxied here:
 *   - no AAR text
 *   - no participant emails
 *   - no full attestationBasisJson (only the count)
 *   - no manifest JSON
 *
 * The vault renders all CUI from its local bundle ZIP. This endpoint
 * exists so EnclaveWatch can keep its bundle inventory + cadence health
 * banner in sync with Codex's authoritative state without log-shipping.
 *
 * Cron cadence on the EnclaveWatch side: every 5 min. Idempotent and
 * cheap to call — single SELECT JOIN on the org's bundles.
 */

import { NextResponse } from "next/server";
import { resolveOrgFromSessionOrBearer } from "@/lib/auth-bearer";
import { db } from "@/db";
import { controlRecords } from "@/db/schema";
import {
  irExerciseBundles,
  irExercises,
} from "@/db/schema.ir-tabletop";
import { and, desc, eq, gte, inArray } from "drizzle-orm";

const IR_CONTROLS = ["3.6.1", "3.6.2", "3.6.3"] as const;
const IR_CMMC = {
  "3.6.1": "IR.L2-3.6.1",
  "3.6.2": "IR.L2-3.6.2",
  "3.6.3": "IR.L2-3.6.3",
} as const;
const ADJUDICATED_STATUSES = new Set([
  "implemented",
  "assessed",
  "inherited",
  "not_applicable",
]);

const DEFAULT_SINCE_DAYS = 90;

export async function GET(req: Request) {
  const ctx = await resolveOrgFromSessionOrBearer(req);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = ctx.orgId;

  // Parse ?since= filter — default to 90 days for first cron tick;
  // EnclaveWatch can supply a tighter window once it's caught up.
  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  let since: Date;
  if (sinceParam) {
    const parsed = new Date(sinceParam);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: "invalid_since", message: "since must be a valid ISO-8601 timestamp" },
        { status: 400 }
      );
    }
    since = parsed;
  } else {
    since = new Date(Date.now() - DEFAULT_SINCE_DAYS * 86_400_000);
  }

  // Bundle rows joined to their exercise (for name/methodology only — no
  // scenario JSON, no narratives).
  const rows = await db
    .select({
      bundleId: irExerciseBundles.id,
      bundleVersion: irExerciseBundles.bundleVersion,
      bundleState: irExerciseBundles.bundleState,
      bundleSha256: irExerciseBundles.bundleSha256,
      manifestSha256: irExerciseBundles.manifestSha256,
      vaultStorageUri: irExerciseBundles.vaultStorageUri,
      vaultStorageRegion: irExerciseBundles.vaultStorageRegion,
      bytesPersisted: irExerciseBundles.bytesPersisted,
      executedAt: irExerciseBundles.executedAt,
      validThroughAt: irExerciseBundles.validThroughAt,
      attendanceSealAt: irExerciseBundles.attendanceSealAt,
      attendanceCorroborationKind: irExerciseBundles.attendanceCorroborationKind,
      attestationBasisJson: irExerciseBundles.attestationBasisJson,
      anchorHash: irExerciseBundles.anchorHash,
      createdAt: irExerciseBundles.createdAt,
      exerciseId: irExercises.id,
      exerciseName: irExercises.name,
      methodology: irExercises.methodology,
    })
    .from(irExerciseBundles)
    .innerJoin(irExercises, eq(irExerciseBundles.exerciseId, irExercises.id))
    .where(
      and(
        eq(irExercises.organizationId, orgId),
        gte(irExerciseBundles.createdAt, since)
      )
    )
    .orderBy(desc(irExerciseBundles.createdAt));

  // Adjudication status for the three IR controls — small lookup, lets the
  // vault's cadence banner show "Codex says 3.6.3 outstanding" without a
  // second round-trip. NOT recomputed on the vault side; Codex stays the
  // source of truth.
  const ctrls = await db
    .select({
      controlId: controlRecords.controlId,
      implementationStatus: controlRecords.implementationStatus,
    })
    .from(controlRecords)
    .where(
      and(
        eq(controlRecords.organizationId, orgId),
        inArray(controlRecords.controlId, [...IR_CONTROLS])
      )
    );
  const ctrlMap = new Map(ctrls.map((c) => [c.controlId, c.implementationStatus]));
  const adjudication = IR_CONTROLS.map((short) => ({
    controlId: short,
    cmmcId: IR_CMMC[short],
    implementationStatus: ctrlMap.get(short) ?? "not_started",
    adjudicated: ADJUDICATED_STATUSES.has(ctrlMap.get(short) ?? "not_started"),
  }));

  // Strip CUI fields. attestation_basis_json is only counted, not echoed —
  // it carries names + emails which an EnclaveWatch viewer should read
  // from the local bundle ZIP, not from a Codex-hosted feed.
  const bundles = rows.map((r) => {
    const basis = (r.attestationBasisJson ?? []) as unknown[];
    return {
      bundleId: r.bundleId,
      exerciseId: r.exerciseId,
      exerciseName: r.exerciseName,
      methodology: r.methodology,
      bundleVersion: r.bundleVersion,
      bundleState: r.bundleState,
      bundleSha256: r.bundleSha256,
      manifestSha256: r.manifestSha256,
      vaultStorageUri: r.vaultStorageUri,
      vaultStorageRegion: r.vaultStorageRegion,
      bytesPersisted: r.bytesPersisted,
      executedAt: r.executedAt?.toISOString() ?? null,
      validThroughAt: r.validThroughAt?.toISOString() ?? null,
      attendanceSealAt: r.attendanceSealAt?.toISOString() ?? null,
      attendanceCorroborationKind: r.attendanceCorroborationKind,
      attestationBasisCount: Array.isArray(basis) ? basis.length : 0,
      anchorHash: r.anchorHash,
      createdAt: r.createdAt.toISOString(),
    };
  });

  return NextResponse.json(
    {
      org: { id: orgId },
      bundles,
      adjudication,
      since: since.toISOString(),
      count: bundles.length,
    },
    {
      // Hint to EnclaveWatch's cron worker: don't refetch within 60s
      // even on its own clock. Bundle state changes are rare.
      headers: { "Cache-Control": "private, max-age=60" },
    }
  );
}
