import { NextResponse } from "next/server";
import { db } from "@/db";
import { governanceRegisters, governanceRegisterEntries } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

/**
 * GET /api/governance/registers/[registerKey] — get register definition and list entries (paginated).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ registerKey: string }> }
) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
    const { registerKey } = await params;
    if (!registerKey) return NextResponse.json({ error: "registerKey required" }, { status: 400 });

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

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const offset = (page - 1) * limit;

    const entries = await db
      .select()
      .from(governanceRegisterEntries)
      .where(eq(governanceRegisterEntries.registerId, register.id))
      .orderBy(desc(governanceRegisterEntries.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(governanceRegisterEntries)
      .where(eq(governanceRegisterEntries.registerId, register.id));

    return NextResponse.json({
      register,
      entries,
      total: totalRow?.count ?? 0,
      page,
      limit,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
