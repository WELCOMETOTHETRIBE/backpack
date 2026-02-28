/**
 * GET /api/boundary/evidence/coverage?evidence_run_id=...&source=windows_server_hardening
 * Returns enclave coverage summary for a specific run.
 */

import { NextResponse } from "next/server";
import { db } from "@/db";
import { accountBoundary } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { computeEnclaveCoverage } from "@/lib/evidence/enclaveCoverage";

export async function GET(req: Request) {
  try {
    const accountId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const { searchParams } = new URL(req.url);
    const evidenceRunId = searchParams.get("evidence_run_id")?.trim();
    const source = searchParams.get("source")?.trim() ?? "windows_server_hardening";

    if (!evidenceRunId) {
      return NextResponse.json({ ok: false, error: "evidence_run_id required" }, { status: 400 });
    }

    const [boundaryRow] = await db
      .select({ boundaryId: accountBoundary.boundaryId })
      .from(accountBoundary)
      .where(eq(accountBoundary.accountId, accountId))
      .limit(1);

    if (!boundaryRow?.boundaryId) {
      return NextResponse.json({ ok: false, error: "no_boundary" }, { status: 400 });
    }

    const summary = await computeEnclaveCoverage({
      db,
      organizationId: accountId,
      accountId,
      boundaryId: boundaryRow.boundaryId,
      evidenceRunId,
      source,
    });

    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to get coverage";
    const status = message === "Unauthorized" || message === "Forbidden" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
