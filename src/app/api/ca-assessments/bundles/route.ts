/**
 * POST /api/ca-assessments/bundles
 *
 * TrainOS pushes finalized CA.L2-3.12.{1,2,3,4} cycle bundle metadata
 * to Codex. Idempotent on (organization_id, cycle_id) — re-pushes
 * update in place.
 *
 * On successful insert/update, fires the canonical rescore trigger
 * for the CA family so the SSP and the SCTM see the new evidence
 * immediately.
 *
 * Auth: bridge (Bearer + HMAC) or session.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { caAssessmentBundles } from "@/db/schema";
import {
  BRIDGE_CONTRACT_VERSION,
  CaBundlePushSchema,
  authorizeCaRequest,
  bridgeErrorResponse,
  logCaAuditEvent,
} from "@/lib/ca-assessment-bridge";
import { scoreControlsAffectedBy } from "@/lib/canonical-state/rescore-trigger";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  let auth: Awaited<ReturnType<typeof authorizeCaRequest>>;
  let parsed: ReturnType<typeof CaBundlePushSchema.safeParse>;
  try {
    auth = await authorizeCaRequest(req, rawBody);
    const json = rawBody.length > 0 ? JSON.parse(rawBody) : {};
    parsed = CaBundlePushSchema.safeParse(json);
    if (!parsed.success) return bridgeErrorResponse(parsed.error);
  } catch (e) {
    return bridgeErrorResponse(e);
  }
  const orgId = auth.organizationId;
  const data = parsed.data;

  // Idempotent upsert on (org, cycle_id).
  const existing = await db
    .select({ id: caAssessmentBundles.id })
    .from(caAssessmentBundles)
    .where(
      and(
        eq(caAssessmentBundles.organizationId, orgId),
        eq(caAssessmentBundles.cycleId, data.cycleId),
      ),
    )
    .limit(1);

  const fields = {
    cycleTitle: data.cycleTitle,
    cycleType: data.cycleType ?? null,
    contentHash: data.contentHash ?? null,
    packageSha256: data.packageSha256 ?? null,
    manifestSha256: data.manifestSha256 ?? null,
    packageVersion: data.packageVersion ?? 1,
    finalizedAtUtc: data.finalizedAtUtc ? new Date(data.finalizedAtUtc) : null,
    retentionUntilUtc: data.retentionUntilUtc
      ? new Date(data.retentionUntilUtc)
      : null,
    controlIds: data.controlIds ?? null,
    controlVerdicts: data.controlVerdicts ?? null,
    sspVersion: data.sspVersion ?? null,
    boundaryVersion: data.boundaryVersion ?? null,
    leadAssessor: data.leadAssessor ?? null,
    reviewer: data.reviewer ?? null,
    approver: data.approver ?? null,
    sctmStatus: data.sctmStatus ?? null,
    cui: data.cui ?? false,
    vaultStorageUri: data.vaultStorageUri ?? null,
    vaultStorageRegion: data.vaultStorageRegion ?? null,
    sourceApp: auth.serviceCaller ?? "mactech-training",
  } as const;

  let row: typeof caAssessmentBundles.$inferSelect;
  let created: boolean;
  if (existing[0]) {
    const [updated] = await db
      .update(caAssessmentBundles)
      .set(fields)
      .where(eq(caAssessmentBundles.id, existing[0].id))
      .returning();
    row = updated;
    created = false;
  } else {
    const [inserted] = await db
      .insert(caAssessmentBundles)
      .values({
        organizationId: orgId,
        cycleId: data.cycleId,
        ...fields,
      })
      .returning();
    row = inserted;
    created = true;
  }

  await logCaAuditEvent({
    organizationId: orgId,
    userId: auth.userId,
    action: created
      ? "ca_assessment_bundle.received"
      : "ca_assessment_bundle.updated",
    resourceType: "ca_assessment_bundle",
    resourceId: row.id,
    details: {
      cycleId: row.cycleId,
      cycleType: row.cycleType,
      packageSha256: row.packageSha256,
      finalizedAtUtc: row.finalizedAtUtc,
      mode: auth.mode,
      serviceCaller: auth.serviceCaller ?? null,
    },
    req,
  });

  // TrainOS Tier 1 #2 — ESP block intake. When the bundle declares
  // TrainOS as the ESP for the CA family, stamp the snapshots with
  // metVia='esp_inheritance' so the rescore below preserves the
  // elevator. Best-effort: malformed ESP blocks logged but don't fail
  // the bundle ingest.
  if (data.esp) {
    try {
      const { applyEspInheritanceFromBundle } = await import(
        "@/lib/esp-inheritance/bridge-intake"
      );
      const espResult = await applyEspInheritanceFromBundle({
        organizationId: orgId,
        espBlock: data.esp,
        evidenceRef: data.packageSha256
          ? `trainos:ca-bundle:${data.packageSha256}`
          : `trainos:ca-bundle:cycle-${data.cycleId}`,
        // CA bundle's ESP scope is the CA family.
        expectedControls: ["3.12.1", "3.12.2", "3.12.3", "3.12.4"],
        triggeredByUserId: auth.userId,
      });
      console.log(
        `[ca-bundle-ingest] esp inheritance applied for ${espResult.appliedControlIds.length} control(s); rescore=${espResult.rescore.rescored}`,
      );
    } catch (err) {
      console.error(
        "[ca-bundle-ingest] esp inheritance intake failed (non-blocking):",
        err,
      );
    }
  }

  // Phase B trigger for the CA family. The rescore picks up the new
  // bundle as ca_bundle citation source for the SSP generator. When
  // the ESP intake above already ran, this is the second rescore in
  // the request — it's idempotent and the second pass just confirms
  // the elevator is sticky.
  await scoreControlsAffectedBy({
    organizationId: orgId,
    triggerSource: "qms_manifest_ingested", // closest existing kind; CA-specific kind can land later
    controlIds: ["3.12.1", "3.12.2", "3.12.3", "3.12.4"],
    triggeredByUserId: auth.userId,
  });

  return NextResponse.json(
    {
      ok: true,
      created,
      bundle: row,
      contractVersion: BRIDGE_CONTRACT_VERSION,
    },
    { status: created ? 201 : 200 },
  );
}
