import { NextResponse } from "next/server";
import { db } from "@/db";
import { userInvitations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance"]);

    const { id } = await params;

    const [invitation] = await db
      .select({ id: userInvitations.id })
      .from(userInvitations)
      .where(
        and(
          eq(userInvitations.id, id),
          eq(userInvitations.organizationId, orgId)
        )
      )
      .limit(1);

    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    await db.delete(userInvitations).where(eq(userInvitations.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
