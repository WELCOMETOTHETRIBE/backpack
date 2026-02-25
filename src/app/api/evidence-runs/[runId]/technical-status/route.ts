import { NextResponse } from "next/server";
import { db } from "@/db";
import { evidenceRuns, evidenceControlTechnicalStatus } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/evidence-runs/:runId/technical-status
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;

  const run = await db.query.evidenceRuns.findFirst({
    where: eq(evidenceRuns.runId, runId),
  });

  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await db
    .select()
    .from(evidenceControlTechnicalStatus)
    .where(eq(evidenceControlTechnicalStatus.evidenceRunId, run.id));

  const summary = {
    total: rows.length,
    pass: rows.filter((r) => r.technicalOk).length,
    fail: rows.filter((r) => !r.technicalOk).length,
  };

  return NextResponse.json({ run_id: runId, summary, rows });
}
