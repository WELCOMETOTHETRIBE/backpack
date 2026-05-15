import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { intakeExceptions, intakeRequests } from "@/db/schema";
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

    const [request] = await db
      .select()
      .from(intakeRequests)
      .where(and(eq(intakeRequests.id, id), eq(intakeRequests.organizationId, orgId)))
      .limit(1);
    if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const reason = String(body.reason ?? "").trim();
    if (!reason) return NextResponse.json({ error: "reason is required" }, { status: 400 });

    const [exception] = await db
      .insert(intakeExceptions)
      .values({
        intakeRequestId: request.id,
        exceptionType: String(body.exceptionType ?? "intake_exception"),
        reason,
        severity: String(body.severity ?? "medium").toLowerCase(),
        affectedControlFamily:
          (body.affectedControlFamily as string | undefined) ?? null,
        affectedControlId: (body.affectedControlId as string | undefined) ?? null,
        compensatingAction:
          (body.compensatingAction as string | undefined) ?? null,
        owner: (body.owner as string | undefined) ?? null,
        dueDate: body.dueDate ? String(body.dueDate) : null,
        status: "open",
        poamReference: (body.poamReference as string | undefined) ?? null,
        openedByUserId: user.id ?? null,
      })
      .returning();

    await transitionIntakeStatus({
      intakeRequestId: request.id,
      orgId,
      actorUserId: user.id ?? null,
      nextStatus: "Exception",
      details: { exceptionId: exception.id },
    });

    return NextResponse.json({ exception }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
