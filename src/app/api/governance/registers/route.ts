import { NextResponse } from "next/server";
import { db } from "@/db";
import { governanceRegisters, governanceRegisterEntries } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

/**
 * GET /api/governance/registers — list register definitions for org.
 * If org has no registers, copy from templates (organizationId null) so org has its own set.
 */
export async function GET() {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    let orgRegisters = await db
      .select()
      .from(governanceRegisters)
      .where(eq(governanceRegisters.organizationId, orgId));

    if (orgRegisters.length === 0) {
      const templates = await db
        .select()
        .from(governanceRegisters)
        .where(sql`${governanceRegisters.organizationId} IS NULL`);
      for (const t of templates) {
        await db.insert(governanceRegisters).values({
          organizationId: orgId,
          projectId: null,
          registerKey: t.registerKey,
          name: t.name,
          description: t.description,
          requiredColumns: t.requiredColumns,
          retainForDays: t.retainForDays,
        });
      }
      orgRegisters = await db
        .select()
        .from(governanceRegisters)
        .where(eq(governanceRegisters.organizationId, orgId));
    }

    const counts = await Promise.all(
      orgRegisters.map(async (r) => {
        const [c] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(governanceRegisterEntries)
          .where(eq(governanceRegisterEntries.registerId, r.id));
        return { registerId: r.id, registerKey: r.registerKey, entryCount: c?.count ?? 0 };
      })
    );

    const lastEntry = await Promise.all(
      orgRegisters.map(async (r) => {
        const [last] = await db
          .select({ createdAt: governanceRegisterEntries.createdAt })
          .from(governanceRegisterEntries)
          .where(eq(governanceRegisterEntries.registerId, r.id))
          .orderBy(desc(governanceRegisterEntries.createdAt))
          .limit(1);
        return { registerId: r.id, lastEntryAt: last?.createdAt ?? null };
      })
    );

    const countByReg = Object.fromEntries(counts.map((c) => [c.registerId, c.entryCount]));
    const lastByReg = Object.fromEntries(lastEntry.map((l) => [l.registerId, l.lastEntryAt]));

    const items = orgRegisters.map((r) => ({
      ...r,
      entryCount: countByReg[r.id] ?? 0,
      lastEntryAt: lastByReg[r.id] ?? null,
    }));

    return NextResponse.json({ items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to list registers";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
