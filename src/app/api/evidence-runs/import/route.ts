import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  evidenceRuns,
  evidenceFiles,
  evidenceControlTechnicalStatus,
  osAssets,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getPortalControlSchema } from "@/lib/compliance/schemas";
import { resolveApplicableControls } from "@/lib/os-baselines/resolver";

type ImportBody = {
  organization_id: string;
  system_id: string;
  run_id: string;
  collected_at: string; // ISO
  collector_name?: string;
  collector_version?: string;
  bundle_root?: string; // "<RunId>/"
  manifest?: unknown; // meta/manifest.json (metadata-only)
  files: Array<{ path: string; sha256: string; size_bytes: number }>;
};

/**
 * POST /api/evidence-runs/import
 * Metadata-only import. No artifact upload.
 * When system_id matches an OS asset with a baseline profile, evaluates only
 * baseline-applicable controls and sets os_asset_id/baseline_profile_id on status rows.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as ImportBody;

  if (!body.organization_id || !body.system_id || !body.run_id || !body.collected_at) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!Array.isArray(body.files) || body.files.length === 0) {
    return NextResponse.json({ error: "files[] required" }, { status: 400 });
  }

  const [run] = await db
    .insert(evidenceRuns)
    .values({
      organizationId: body.organization_id,
      systemId: body.system_id,
      runId: body.run_id,
      collectedAt: new Date(body.collected_at),
      collectorName: body.collector_name ?? "unknown",
      collectorVersion: body.collector_version ?? "unknown",
      bundleRoot: body.bundle_root ?? `${body.run_id}/`,
      manifest: body.manifest ?? {},
      hashAlgorithm: "sha256",
    })
    .returning();

  if (!run) {
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }

  await db.insert(evidenceFiles).values(
    body.files.map((f) => ({
      evidenceRunId: run.id,
      path: (f.path || "").replaceAll("\\", "/"),
      sha256: (f.sha256 || "").toLowerCase(),
      sizeBytes: Number(f.size_bytes || 0),
    }))
  );

  const present = new Set<string>(
    body.files.map((f) => (f.path || "").replaceAll("\\", "/"))
  );

  type StatusRow = {
    evidenceRunId: string;
    controlId: string;
    technicalOk: boolean;
    missingFiles: string[];
    presentFiles: string[];
    osAssetId?: string | null;
    baselineProfileId?: string | null;
  };

  const statuses: StatusRow[] = [];

  // Check if system_id is an OS asset in this org (for baseline-aware scoring)
  const [osAssetRow] = await db
    .select({ id: osAssets.id, baselineProfileId: osAssets.baselineProfileId })
    .from(osAssets)
    .where(
      and(
        eq(osAssets.id, body.system_id),
        eq(osAssets.organizationId, body.organization_id)
      )
    );

  if (osAssetRow?.baselineProfileId) {
    const { controls, checksByControlId } = await resolveApplicableControls({
      id: osAssetRow.id,
      baselineProfileId: osAssetRow.baselineProfileId,
    });

    for (const c of controls) {
      const checks = checksByControlId[c.controlId] ?? [];
      const requiredFiles = Array.from(
        new Set(checks.flatMap((ch) => ch.evidenceRequiredFiles ?? []))
      );
      if (requiredFiles.length === 0) continue;

      const missing = requiredFiles.filter((p) => !present.has(p));
      const ok = missing.length === 0;

      statuses.push({
        evidenceRunId: run.id,
        controlId: c.controlId,
        technicalOk: ok,
        missingFiles: missing,
        presentFiles: requiredFiles.filter((p) => present.has(p)),
        osAssetId: osAssetRow.id,
        baselineProfileId: osAssetRow.baselineProfileId,
      });
    }
  }

  if (statuses.length === 0) {
    // Fallback: use portal schema for all controls with technical_validation (legacy / non-baseline runs)
    const portal = getPortalControlSchema();
    const portalControls = (portal?.controls ?? []) as Array<{
      control_id: string;
      technical_validation?: { required_files?: string[] };
    }>;
    for (const c of portalControls) {
      const requiredFiles: string[] = c?.technical_validation?.required_files ?? [];
      if (!requiredFiles.length) continue;

      const missing = requiredFiles.filter((p) => !present.has(p));
      const ok = missing.length === 0;

      statuses.push({
        evidenceRunId: run.id,
        controlId: c.control_id,
        technicalOk: ok,
        missingFiles: missing,
        presentFiles: requiredFiles.filter((p) => present.has(p)),
      });
    }
  }

  if (statuses.length) {
    await db.insert(evidenceControlTechnicalStatus).values(statuses);
  }

  return NextResponse.json({
    ok: true,
    evidence_run_id: run.id,
    run_id: body.run_id,
    technical_controls_evaluated: statuses.length,
  });
}
