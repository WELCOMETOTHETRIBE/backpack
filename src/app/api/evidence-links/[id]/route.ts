import { NextResponse } from "next/server";
import { db } from "@/db";
import { controlEvidenceLinks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

/**
 * DELETE /api/evidence-links/:id
 * Removes an evidence metadata link. Admin/Compliance only.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance"]);
    const { id } = await params;

    const [existing] = await db
      .select({ id: controlEvidenceLinks.id })
      .from(controlEvidenceLinks)
      .where(
        and(eq(controlEvidenceLinks.id, id), eq(controlEvidenceLinks.organizationId, orgId))
      )
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db
      .delete(controlEvidenceLinks)
      .where(eq(controlEvidenceLinks.id, id));

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
