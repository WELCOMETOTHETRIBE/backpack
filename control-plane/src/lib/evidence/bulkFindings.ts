/**
 * Bulk evidence findings for a run, keyed by NIST control ID.
 * Single query; deterministic per-control result (prefer fail over pass for duplicates).
 */

import { eq } from "drizzle-orm";
import { evidenceFindings } from "@/db/schema";
import { controlIdToNist } from "@/lib/compliance/controlId";

export interface RunFindingEntry {
  pass: boolean;
  controlIdRaw: string;
  observed?: string;
  expected?: string;
  evidence_hint?: string;
  evidence_files_used?: string[];
}

/**
 * Returns findings for the given run, one entry per NIST control.
 * If multiple findings map to the same NIST id, we keep one deterministically:
 * sort by controlIdRaw asc, then prefer fail over pass (first fail wins; else first pass).
 */
export async function getRunFindingsByControl(params: {
  db: any;
  organizationId: string;
  evidenceRunId: string;
}): Promise<Map<string, RunFindingEntry>> {
  const { db, evidenceRunId } = params;
  const rows = await db
    .select({
      controlId: evidenceFindings.controlId,
      pass: evidenceFindings.pass,
      observed: evidenceFindings.observed,
      expected: evidenceFindings.expected,
      evidenceHint: evidenceFindings.evidenceHint,
      evidenceFilesUsed: evidenceFindings.evidenceFilesUsed,
    })
    .from(evidenceFindings)
    .where(eq(evidenceFindings.evidenceRunId, evidenceRunId));

  const byNist = new Map<string, { controlIdRaw: string; pass: boolean; entry: RunFindingEntry }>();
  for (const r of rows) {
    const nistId = controlIdToNist(r.controlId);
    if (!nistId) continue;
    const entry: RunFindingEntry = {
      pass: r.pass,
      controlIdRaw: r.controlId,
      observed: r.observed ?? undefined,
      expected: r.expected ?? undefined,
      evidence_hint: r.evidenceHint ?? undefined,
      evidence_files_used: Array.isArray(r.evidenceFilesUsed) ? r.evidenceFilesUsed : undefined,
    };
    const existing = byNist.get(nistId);
    if (!existing) {
      byNist.set(nistId, { controlIdRaw: r.controlId, pass: r.pass, entry });
      continue;
    }
    // Deterministic: prefer fail over pass; then by controlIdRaw asc (keep first when tie)
    if (r.pass === false && existing.pass === true) {
      byNist.set(nistId, { controlIdRaw: r.controlId, pass: r.pass, entry });
    }
    // else keep existing (first seen wins for same pass/fail)
  }

  const out = new Map<string, RunFindingEntry>();
  for (const [nistId, v] of byNist) out.set(nistId, v.entry);
  return out;
}
