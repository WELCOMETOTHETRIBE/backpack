import { NextResponse } from "next/server";
import { db } from "@/db";
import { governanceRegisters, governanceRegisterEntries } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { logGovernanceAudit } from "@/lib/governance/audit";

/** PATCH /api/governance/registers/entries/[entryId] — update entryData or hold */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ entryId: string }> }
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance", "Assessor"]);
    const { entryId } = await params;
    if (!entryId) return NextResponse.json({ error: "entryId required" }, { status: 400 });

    const [entry] = await db
      .select()
      .from(governanceRegisterEntries)
      .where(eq(governanceRegisterEntries.id, entryId));

    if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

    const [register] = await db
      .select()
      .from(governanceRegisters)
      .where(eq(governanceRegisters.id, entry.registerId));

    if (!register || register.organizationId !== orgId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const updates: { entryData?: Record<string, unknown>; hold?: number; updatedAt: Date } = { updatedAt: new Date() };
    if (body.entryData !== undefined) updates.entryData = body.entryData as Record<string, unknown>;
    if (body.hold !== undefined) updates.hold = body.hold ? 1 : 0;

    await db
      .update(governanceRegisterEntries)
      .set(updates)
      .where(eq(governanceRegisterEntries.id, entryId));

    await logGovernanceAudit(orgId, user.id ?? null, "governance_register_entry_updated", "governance_register_entry", entryId, {});

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
