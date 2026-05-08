import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { requireOrg, requireRole } from "@/lib/auth";
import { db } from "@/db";
import { userInvitations } from "@/db/schema";

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance"]);

    const deleted = await db
      .delete(userInvitations)
      .where(and(eq(userInvitations.id, id), eq(userInvitations.organizationId, orgId)))
      .returning({ id: userInvitations.id });

    if (deleted.length === 0) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Unauthorized") ? 401 : message.includes("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
