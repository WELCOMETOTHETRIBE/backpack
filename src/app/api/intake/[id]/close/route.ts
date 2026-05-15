import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { intakeRequests } from "@/db/schema";
import { requireOrg, requireRole } from "@/lib/auth";
import {
  evaluateIntakeClosureReadiness,
  transitionIntakeStatus,
} from "@/lib/intake/service";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);
    const { id } = await params;

    const rows = await db
      .select()
      .from(intakeRequests)
      .where(and(eq(intakeRequests.id, id), eq(intakeRequests.organizationId, orgId)))
      .limit(1);
    const request = rows[0];
    if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const closure = await evaluateIntakeClosureReadiness({
      orgId,
      intakeRequestId: request.id,
    });
    if (!closure.closeable) {
      return NextResponse.json(
        {
          error: "Closure blocked: missing lifecycle requirements",
          missingRequirements: closure.missingRequirements,
          exceptionRequired: true,
        },
        { status: 409 },
      );
    }

    if (closure.requiresException && request.status !== "Exception") {
      await transitionIntakeStatus({
        intakeRequestId: request.id,
        orgId,
        actorUserId: user.id ?? null,
        nextStatus: "Exception",
        details: {
          closureWithException: true,
          missingRequirements: closure.missingRequirements,
        },
      });
    }

    await transitionIntakeStatus({
      intakeRequestId: request.id,
      orgId,
      actorUserId: user.id ?? null,
      nextStatus: "Closed",
      details: { closureMethod: "operator_closure" },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
