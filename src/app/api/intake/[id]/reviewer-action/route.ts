import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { intakeRequests, intakeReviewActions } from "@/db/schema";
import { requireOrg, requireRole } from "@/lib/auth";
import { transitionIntakeStatus } from "@/lib/intake/service";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance", "Assessor"]);
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const actionType = String(body.actionType ?? "").trim();
    if (!actionType) {
      return NextResponse.json({ error: "actionType is required" }, { status: 400 });
    }

    const [request] = await db
      .select()
      .from(intakeRequests)
      .where(and(eq(intakeRequests.id, id), eq(intakeRequests.organizationId, orgId)))
      .limit(1);
    if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [action] = await db
      .insert(intakeReviewActions)
      .values({
        intakeRequestId: request.id,
        actionType,
        actionNotes: (body.actionNotes as string | undefined) ?? null,
        performedByIdentity:
          (body.performedByIdentity as string | undefined) ?? user.email ?? null,
        performedByUserId: user.id ?? null,
      })
      .returning();

    if (actionType === "reviewer_approved") {
      if (!["Imported to Vault", "Exception", "Reviewer Approved"].includes(request.status)) {
        return NextResponse.json(
          { error: "Reviewer approval requires vault import completion or documented exception" },
          { status: 409 },
        );
      }
      await transitionIntakeStatus({
        intakeRequestId: request.id,
        orgId,
        actorUserId: user.id ?? null,
        nextStatus: "Reviewer Approved",
        details: { reviewActionId: action.id },
      });
    }

    return NextResponse.json({ action }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
