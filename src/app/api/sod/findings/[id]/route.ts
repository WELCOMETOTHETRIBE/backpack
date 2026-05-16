/**
 * PATCH /api/sod/findings/[id]
 *
 * Disposition workflow for a single finding. Transitions an open finding
 * to one of: remediated | justified | accepted_risk. Justification text
 * is required for justified / accepted_risk; optional for remediated.
 *
 * Body shape: { status: "remediated" | "justified" | "accepted_risk", justification?: string }
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { sodFindings } from "@/db/schema";
import { requireOrg, requireRole, type SessionUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const TERMINAL_STATUSES = new Set(["remediated", "justified", "accepted_risk"]);

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  let orgId: string;
  let user: SessionUser;
  try {
    orgId = await requireOrg();
    user = await requireRole(["Admin", "Compliance"]);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unauthorized" },
      { status: 401 },
    );
  }

  const { id } = await ctx.params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "finding id required" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    status?: unknown;
    justification?: unknown;
  };

  const status = typeof body.status === "string" ? body.status : "";
  if (!TERMINAL_STATUSES.has(status)) {
    return NextResponse.json(
      { error: `status must be one of ${[...TERMINAL_STATUSES].join(", ")}` },
      { status: 400 },
    );
  }
  const justification = typeof body.justification === "string" ? body.justification.trim() : "";
  if ((status === "justified" || status === "accepted_risk") && justification.length === 0) {
    return NextResponse.json(
      { error: `justification text required when status is ${status}` },
      { status: 400 },
    );
  }

  const [existing] = await db
    .select({
      id: sodFindings.id,
      status: sodFindings.status,
      subjectPrincipal: sodFindings.subjectPrincipal,
      pairRoleA: sodFindings.pairRoleA,
      pairRoleB: sodFindings.pairRoleB,
    })
    .from(sodFindings)
    .where(and(eq(sodFindings.id, id), eq(sodFindings.organizationId, orgId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "finding not found" }, { status: 404 });
  }
  if (existing.status !== "open") {
    return NextResponse.json(
      { error: `finding already closed (current status: ${existing.status})` },
      { status: 409 },
    );
  }

  const now = new Date();
  const [updated] = await db
    .update(sodFindings)
    .set({
      status,
      closedAt: now,
      closedById: user.id ?? null,
      justificationText: justification || null,
      updatedAt: now,
    })
    .where(eq(sodFindings.id, id))
    .returning();

  try {
    await writeAuditLog({
      organizationId: orgId,
      action: "sod.finding.disposed",
      resourceType: "sod_finding",
      resourceId: id,
      details: {
        new_status: status,
        principal: existing.subjectPrincipal,
        pair: [existing.pairRoleA, existing.pairRoleB],
        justification_length: justification.length,
        closed_by_id: user.id ?? null,
      },
    });
  } catch (err) {
    console.error("[sod-finding] audit log write failed:", err);
  }

  return NextResponse.json({ finding: updated });
}
