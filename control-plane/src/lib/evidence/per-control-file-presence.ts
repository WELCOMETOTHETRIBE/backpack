/**
 * Per-control file-presence evaluator.
 *
 * Walks the portal control schema's `technical_validation.required_files`
 * for each control, checks the manifest's file paths, and emits a row to
 * `evidence_control_technical_status` per control with a required-files
 * spec.
 *
 * History: this evaluator originally lived inline in
 * /api/evidence-runs/import/route.ts (the legacy "metadata-only import"
 * path). The v2 ingest route at /api/evidence/v2/ingest never called it,
 * so collect_cui_evidence_v2 uploads landed an evidence_run row with file
 * metadata but produced ZERO evidence_control_technical_status rows —
 * leaving the per-control file-presence aggregate stale on the codex side
 * even though the bundles were arriving fine. TrainOS surfaced this in
 * the "stalled per-control evaluator" report; the fix is to extract the
 * helper and call it from BOTH ingest paths so any code path that lands
 * a manifest produces the per-control aggregate as a side effect.
 */

import { db } from "@/db";
import { evidenceControlTechnicalStatus } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPortalControlSchema } from "@/lib/compliance/schemas";

export interface FilePathInput {
  path: string;
}

export interface ControlFilePresenceResult {
  controlId: string;
  technicalOk: boolean;
  missingFiles: string[];
  presentFiles: string[];
}

/**
 * Pure: given a set of file paths in a manifest, return a per-control
 * file-presence status against the portal control schema. No DB writes.
 * Used for previewing / testing without a run row.
 */
export function evaluateFilePresence(
  files: ReadonlyArray<FilePathInput>
): ControlFilePresenceResult[] {
  const portal = getPortalControlSchema();
  const present = new Set<string>(
    files.map((f) => (f.path || "").replaceAll("\\", "/"))
  );

  const out: ControlFilePresenceResult[] = [];
  const controls = (portal.controls ?? []) as Array<{
    control_id: string;
    technical_validation?: { required_files?: string[] };
  }>;

  for (const c of controls) {
    const requiredFiles: string[] = c?.technical_validation?.required_files ?? [];
    if (requiredFiles.length === 0) continue;

    const missing = requiredFiles.filter((p) => !present.has(p));
    const ok = missing.length === 0;
    out.push({
      controlId: c.control_id,
      technicalOk: ok,
      missingFiles: missing,
      presentFiles: requiredFiles.filter((p) => present.has(p)),
    });
  }

  return out;
}

/**
 * Persist file-presence statuses for a given evidence_run. Caller passes
 * the run id and the file paths from the manifest. This function:
 *   - computes per-control statuses via evaluateFilePresence()
 *   - deletes any existing rows for the run (idempotent re-ingest)
 *   - inserts the new rows
 *
 * Returns the number of statuses written.
 */
export async function persistFilePresenceForRun(
  evidenceRunId: string,
  files: ReadonlyArray<FilePathInput>
): Promise<number> {
  const statuses = evaluateFilePresence(files);
  if (statuses.length === 0) return 0;

  // Idempotent: drop prior rows for this run, then insert. Safer than
  // ON CONFLICT against the composite (run, control) PK because the schema
  // hint of any control with `required_files` could change between runs.
  await db
    .delete(evidenceControlTechnicalStatus)
    .where(eq(evidenceControlTechnicalStatus.evidenceRunId, evidenceRunId));

  await db.insert(evidenceControlTechnicalStatus).values(
    statuses.map((s) => ({
      evidenceRunId,
      controlId: s.controlId,
      technicalOk: s.technicalOk,
      missingFiles: s.missingFiles,
      presentFiles: s.presentFiles,
    }))
  );

  return statuses.length;
}
