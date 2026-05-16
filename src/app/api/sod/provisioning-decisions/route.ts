/**
 * GET /api/sod/provisioning-decisions
 *
 * Lists pre-flight provisioning decisions for the caller's org. Drives
 * the Pre-flight tab on SCTM 3.1.4.
 *
 * Query:
 *   ?decision=allow|allow_with_attestation|deny|fail_open|all (default: all)
 *   ?limit=N (default 100, max 500)
 */
import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { sodProvisioningDecisions } from "@/db/schema";
import { requireOrg, requireRole } from "@/lib/auth";

const VALID_DECISIONS = new Set([
  "allow",
  "allow_with_attestation",
  "deny",
  "fail_open",
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
  const decisionParam = url.searchParams.get("decision") ?? "all";
  if (!VALID_DECISIONS.has(decisionParam)) {
    return NextResponse.json(
      { error: `decision must be one of ${[...VALID_DECISIONS].join(", ")}` },
      { status: 400 },
    );
  }
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") ?? "100", 10) || 100));

  const where =
    decisionParam === "all"
      ? eq(sodProvisioningDecisions.organizationId, orgId)
      : and(
          eq(sodProvisioningDecisions.organizationId, orgId),
          eq(sodProvisioningDecisions.decision, decisionParam),
        );

  const rows = await db
    .select()
    .from(sodProvisioningDecisions)
    .where(where)
    .orderBy(desc(sodProvisioningDecisions.createdAt))
    .limit(limit);

  // Aggregate counts per decision (independent of filter) so the tab
  // header can highlight denies — the highest-defensibility signal.
  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      allow: sql<number>`count(*)::int FILTER (WHERE decision = 'allow')`,
      with_attestation: sql<number>`count(*)::int FILTER (WHERE decision = 'allow_with_attestation')`,
      deny: sql<number>`count(*)::int FILTER (WHERE decision = 'deny')`,
      fail_open: sql<number>`count(*)::int FILTER (WHERE decision = 'fail_open')`,
    })
    .from(sodProvisioningDecisions)
    .where(eq(sodProvisioningDecisions.organizationId, orgId));

  return NextResponse.json({
    items: rows,
    count: rows.length,
    counts: counts ?? { total: 0, allow: 0, with_attestation: 0, deny: 0, fail_open: 0 },
  });
}
