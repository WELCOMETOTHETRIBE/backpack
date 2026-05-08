import { NextResponse } from "next/server";
import { db } from "@/db";
import { governanceRegisters, governanceRegisterEntries } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { logGovernanceAudit } from "@/lib/governance/audit";
import { requireBoundaryForOrg } from "@/lib/evidence-engine/validate-boundary";

/** POST /api/governance/registers/[registerKey]/entries — create entry. Body: { boundary_id?: string, entryData: Record<string, unknown> } */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ registerKey: string }> }
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance", "Assessor"]);
    const { registerKey } = await params;
    if (!registerKey) return NextResponse.json({ error: "registerKey required" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const boundaryId = (body.boundary_id ?? body.boundaryId) as string | undefined;
    const boundaryResult = await requireBoundaryForOrg(orgId, boundaryId);
    if (boundaryResult instanceof NextResponse) return boundaryResult;
    const { boundary } = boundaryResult;

    const [register] = await db
      .select()
      .from(governanceRegisters)
      .where(
        and(
          eq(governanceRegisters.organizationId, orgId),
          eq(governanceRegisters.registerKey, registerKey)
        )
      );

    if (!register) return NextResponse.json({ error: "Register not found" }, { status: 404 });

    const entryData = (body.entryData ?? {}) as Record<string, unknown>;

    const [entry] = await db
      .insert(governanceRegisterEntries)
      .values({
        registerId: register.id,
        boundaryId: boundary.id,
        entryData,
        createdById: user.id ?? null,
        hold: 0,
      })
      .returning();

    await logGovernanceAudit(orgId, user.id ?? null, "governance_register_entry_created", "governance_register_entry", entry?.id ?? null, { registerKey });

    return NextResponse.json(entry);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
