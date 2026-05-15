import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { intakeAccessGrants, intakeRequests } from "@/db/schema";
import { requireOrg, requireRole } from "@/lib/auth";
import { transitionIntakeStatus } from "@/lib/intake/service";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);
    const { id } = await params;

    const [request] = await db
      .select()
      .from(intakeRequests)
      .where(and(eq(intakeRequests.id, id), eq(intakeRequests.organizationId, orgId)))
      .limit(1);
    if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const grants = await db
      .select({ id: intakeAccessGrants.id })
      .from(intakeAccessGrants)
      .where(eq(intakeAccessGrants.intakeRequestId, request.id));
    if (!grants.length) {
      return NextResponse.json(
        { error: "No access grants found to revoke" },
        { status: 409 },
      );
    }

    await db
      .update(intakeAccessGrants)
      .set({
        accessRevokedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(intakeAccessGrants.intakeRequestId, request.id),
          isNull(intakeAccessGrants.accessRevokedAt),
        ),
      );

    await transitionIntakeStatus({
      intakeRequestId: request.id,
      orgId,
      actorUserId: user.id ?? null,
      nextStatus: "Access Revoked",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
