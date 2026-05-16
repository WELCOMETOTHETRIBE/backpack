/**
 * GET /api/sod/findings
 *
 * Lists sod_findings for the caller's org. Drives the SCTM 3.1.4
 * Findings tab.
 *
 * Query:
 *   ?status=open|remediated|justified|accepted_risk|all (default: open)
 *   ?limit=N (default 100, max 500)
 */
import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { sodFindings } from "@/db/schema";
import { requireOrg, requireRole } from "@/lib/auth";

const VALID_STATUSES = new Set([
  "open",
  "remediated",
  "justified",
  "accepted_risk",
  "all",
]);

export async function GET(req: Request) {
  let orgId: string;
  try {
    orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unauthorized" },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status") ?? "open";
  if (!VALID_STATUSES.has(statusParam)) {
    return NextResponse.json(
      { error: `status must be one of ${[...VALID_STATUSES].join(", ")}` },
      { status: 400 },
    );
  }
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") ?? "100", 10) || 100));

  const where =
    statusParam === "all"
      ? eq(sodFindings.organizationId, orgId)
      : and(eq(sodFindings.organizationId, orgId), eq(sodFindings.status, statusParam));

  const rows = await db
    .select()
    .from(sodFindings)
    .where(where)
    .orderBy(desc(sodFindings.openedAt))
    .limit(limit);

  return NextResponse.json({ findings: rows, count: rows.length });
}
