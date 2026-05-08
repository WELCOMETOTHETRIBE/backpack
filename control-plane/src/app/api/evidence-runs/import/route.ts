import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { evidenceRuns, evidenceFiles } from "@/db/schema";
import { persistFilePresenceForRun } from "@/lib/evidence/per-control-file-presence";

function legacyRunFingerprint(runId: string, files: Array<{ path: string; sha256: string }>): string {
  const canonical = [...files]
    .map((f) => `${(f.path || "").replaceAll("\\", "/")}:${(f.sha256 || "").toLowerCase()}`)
    .sort();
  return createHash("sha256").update(runId + "|" + JSON.stringify(canonical), "utf8").digest("hex");
}

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

  const runFingerprint = legacyRunFingerprint(body.run_id, body.files);
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
      source: "legacy",
      runFingerprint,
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

  // Per-control file-presence evaluator — shared with /api/evidence/v2/ingest
  // so any path that lands a manifest produces the per-control aggregate.
  const technicalControlsEvaluated = await persistFilePresenceForRun(
    run.id,
    body.files
  );

  return NextResponse.json({
    ok: true,
    evidence_run_id: run.id,
    run_id: body.run_id,
    technical_controls_evaluated: technicalControlsEvaluated,
  });
}
