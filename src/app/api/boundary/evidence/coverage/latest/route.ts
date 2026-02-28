/**
 * GET /api/boundary/evidence/coverage/latest?source=windows_server_hardening
 * Returns enclave coverage summary for the latest Windows hardening run.
 */

import { NextResponse } from "next/server";
import { db } from "@/db";
import { accountBoundary } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { getLatestRunForSource } from "@/lib/evidence/getLatestRun";
import { computeEnclaveCoverage } from "@/lib/evidence/enclaveCoverage";

export async function GET(req: Request) {
  try {
    const accountId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const [boundaryRow] = await db
      .select({ boundaryId: accountBoundary.boundaryId })
      .from(accountBoundary)
      .where(eq(accountBoundary.accountId, accountId))
      .limit(1);

    if (!boundaryRow?.boundaryId) {
      return NextResponse.json({ ok: false, error: "no_boundary" }, { status: 400 });
    }

    const source = new URL(req.url).searchParams.get("source")?.trim() ?? "windows_server_hardening";
    const latest = await getLatestRunForSource({
      db,
      organizationId: accountId,
      boundaryId: boundaryRow.boundaryId,
      source,
    });

    if (!latest) {
      return NextResponse.json({ ok: false, error: "no_run" });
    }

    const summary = await computeEnclaveCoverage({
      db,
      organizationId: accountId,
      accountId,
      boundaryId: boundaryRow.boundaryId,
      evidenceRunId: latest.evidenceRunId,
      source,
    });

    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to get coverage";
    const status = message === "Unauthorized" || message === "Forbidden" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
