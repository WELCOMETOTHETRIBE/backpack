/**
 * GET /api/sod/r10-break-glass
 *
 * Lists R10 break-glass activations for the caller's org. Drives the
 * Break-glass tab on SCTM 3.1.4.
 *
 * Query:
 *   ?status=pending_review|reviewed|overdue|void|all (default: pending_review)
 *   ?limit=N (default 100, max 500)
 *
 * "overdue" is computed at read time: a pending_review row whose
 * activation_started_at is more than 24h ago. We don't store it as a
 * persistent status — the SLA window is observable from the row.
 */
import { NextResponse } from "next/server";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { r10BreakGlassActivations } from "@/db/schema";
import { requireOrg, requireRole } from "@/lib/auth";

const REVIEW_SLA_MS = 24 * 60 * 60 * 1000;
const VALID_STATUSES = new Set([
  "pending_review",
  "reviewed",
  "overdue",
  "void",
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
  const statusParam = url.searchParams.get("status") ?? "pending_review";
  if (!VALID_STATUSES.has(statusParam)) {
    return NextResponse.json(
      { error: `status must be one of ${[...VALID_STATUSES].join(", ")}` },
      { status: 400 },
    );
  }
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") ?? "100", 10) || 100));

  // "overdue" = persisted status is still 'pending_review' but the
  // activation started > 24h ago. Computed at read time.
  const slaThreshold = new Date(Date.now() - REVIEW_SLA_MS);

  let where;
  if (statusParam === "all") {
    where = eq(r10BreakGlassActivations.organizationId, orgId);
  } else if (statusParam === "overdue") {
    where = and(
      eq(r10BreakGlassActivations.organizationId, orgId),
      eq(r10BreakGlassActivations.status, "pending_review"),
      lt(r10BreakGlassActivations.activationStartedAt, slaThreshold),
    );
  } else {
    where = and(
      eq(r10BreakGlassActivations.organizationId, orgId),
      eq(r10BreakGlassActivations.status, statusParam),
    );
  }

  const rows = await db
    .select()
    .from(r10BreakGlassActivations)
    .where(where)
    .orderBy(desc(r10BreakGlassActivations.activationStartedAt))
    .limit(limit);

  // Annotate each row with a derived `derivedStatus` flag so the UI can
  // show "OVERDUE" without doing the math client-side.
  const items = rows.map((r) => {
    const isOverdue =
      r.status === "pending_review" &&
      r.activationStartedAt.getTime() < slaThreshold.getTime();
    return {
      ...r,
      derivedStatus: isOverdue ? "overdue" : r.status,
      sla_window_hours: 24,
    };
  });

  // Counts for the tab header (independent of the current filter).
  const [{ pending }] = await db
    .select({
      pending: sql<number>`count(*)::int FILTER (WHERE status = 'pending_review')`,
    })
    .from(r10BreakGlassActivations)
    .where(eq(r10BreakGlassActivations.organizationId, orgId));

  return NextResponse.json({
    items,
    count: items.length,
    pending_total: pending,
  });
}
