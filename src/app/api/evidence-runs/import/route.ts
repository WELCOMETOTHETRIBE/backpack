import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  evidenceRuns,
  evidenceFiles,
  evidenceControlTechnicalStatus,
} from "@/db/schema";
import { getPortalControlSchema } from "@/lib/compliance/schemas";

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

  const portal = getPortalControlSchema();
  const present = new Set<string>(
    body.files.map((f) => (f.path || "").replaceAll("\\", "/"))
  );

  const statuses: Array<{
    evidenceRunId: string;
    controlId: string;
    technicalOk: boolean;
    missingFiles: string[];
    presentFiles: string[];
  }> = [];
  const controls = (portal.controls ?? []) as Array<{
    control_id: string;
    technical_validation?: { required_files?: string[] };
  }>;
  for (const c of controls) {
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
