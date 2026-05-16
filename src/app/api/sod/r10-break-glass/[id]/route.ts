/**
 * PATCH /api/sod/r10-break-glass/[id]
 *
 * Post-hoc review of an R10 break-glass activation. Operator (Admin or
 * Compliance) signs off on the activation; status moves from
 * `pending_review` to `reviewed`. Required: review_notes (text, the
 * reviewer's written summary of why the elevation was legitimate).
 *
 * **SoD guard:** the literal AC.L2-3.1.4 enforcement. The reviewer
 * cannot be the activator. We can't simply compare user ids — the
 * activator is a free-form principal string from the enclave-side
 * collector (UPN / sAMAccountName), and the reviewer is a Codex user.
 * Different identity spaces.
 *
 * Heuristic: compare the activator principal against the reviewer's
 * email and name (case-insensitive substring match in both directions).
 * If either matches, reject with 409 and a clear message. False
 * negatives (a user impersonating someone else's account name) are
 * out of scope — that's a separate identity-spoofing problem.
 *
 * Body: { review_notes: string }
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { r10BreakGlassActivations } from "@/db/schema";
import { requireOrg, requireRole, type SessionUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

/**
 * Returns true if there's any plausible match between the activator
 * principal and the reviewer's identity. Deliberately permissive — we
 * prefer false positives (block a legitimate review and require a
 * different reviewer) over false negatives (allow self-review of a
 * break-glass event).
 */
function isSamePerson(activatorPrincipal: string, reviewer: SessionUser): boolean {
  const ap = activatorPrincipal.toLowerCase().trim();
  if (!ap) return false;
  const candidates: string[] = [];
  if (reviewer.email) candidates.push(reviewer.email.toLowerCase().trim());
  if (reviewer.name) candidates.push(reviewer.name.toLowerCase().trim());
  for (const c of candidates) {
    if (!c) continue;
    if (c === ap) return true;
    // UPN ("alice@mactech") vs email ("alice@mactech.com") — match on
    // local-part when at least one side has a domain.
    const apLocal = ap.split("@")[0];
    const cLocal = c.split("@")[0];
    if (apLocal && cLocal && apLocal === cLocal) return true;
    // Display-name match against activator's local-part (loose).
    if (cLocal === apLocal) return true;
  }
  return false;
}

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
    return NextResponse.json({ error: "activation id required" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { review_notes?: unknown };
  const notes = typeof body.review_notes === "string" ? body.review_notes.trim() : "";
  if (notes.length === 0) {
    return NextResponse.json(
      { error: "review_notes (non-empty string) required" },
      { status: 400 },
    );
  }

  const [existing] = await db
    .select({
      id: r10BreakGlassActivations.id,
      activatorPrincipal: r10BreakGlassActivations.activatorPrincipal,
      activatedRole: r10BreakGlassActivations.activatedRole,
      activationStartedAt: r10BreakGlassActivations.activationStartedAt,
      status: r10BreakGlassActivations.status,
    })
    .from(r10BreakGlassActivations)
    .where(
      and(
        eq(r10BreakGlassActivations.id, id),
        eq(r10BreakGlassActivations.organizationId, orgId),
      ),
    )
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "activation not found" }, { status: 404 });
  }
  if (existing.status !== "pending_review") {
    return NextResponse.json(
      { error: `activation already in status '${existing.status}'` },
      { status: 409 },
    );
  }

  if (isSamePerson(existing.activatorPrincipal, user)) {
    return NextResponse.json(
      {
        error:
          "Separation of Duties (AC.L2-3.1.4): you cannot review your own break-glass activation. Route to a non-activator reviewer.",
        code: "SOD_SELF_REVIEW_BLOCKED",
      },
      { status: 409 },
    );
  }

  const now = new Date();
  const [updated] = await db
    .update(r10BreakGlassActivations)
    .set({
      status: "reviewed",
      reviewedAt: now,
      reviewedById: user.id ?? null,
      reviewNotes: notes,
      updatedAt: now,
    })
    .where(eq(r10BreakGlassActivations.id, id))
    .returning();

  try {
    await writeAuditLog({
      organizationId: orgId,
      action: "sod.r10_break_glass.reviewed",
      resourceType: "r10_break_glass_activation",
      resourceId: id,
      details: {
        activator: existing.activatorPrincipal,
        activated_role: existing.activatedRole,
        activation_started_at: existing.activationStartedAt.toISOString(),
        reviewed_by_id: user.id ?? null,
        reviewer_email: user.email ?? null,
        review_notes_length: notes.length,
        sla_breached:
          Date.now() - existing.activationStartedAt.getTime() > 24 * 60 * 60 * 1000,
      },
    });
  } catch (err) {
    console.error("[r10-break-glass] audit log write failed:", err);
  }

  return NextResponse.json({ activation: updated });
}
