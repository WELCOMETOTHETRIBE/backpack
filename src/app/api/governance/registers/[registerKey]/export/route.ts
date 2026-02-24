import { NextResponse } from "next/server";
import { db } from "@/db";
import { governanceRegisters, governanceRegisterEntries } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

function csvEscape(s: string | null | undefined): string {
  if (s == null) return "";
  const t = String(s);
  if (t.includes(",") || t.includes('"') || t.includes("\n")) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

/** GET /api/governance/registers/[registerKey]/export — CSV of entries */
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

    const entries = await db
      .select()
      .from(governanceRegisterEntries)
      .where(eq(governanceRegisterEntries.registerId, register.id))
      .orderBy(desc(governanceRegisterEntries.createdAt));

    const columns = (register.requiredColumns as { key: string; label: string }[]) ?? [];
    const keys = columns.map((c) => c.key);
    const header = ["id", "created_at", "hold", ...keys];
    const rows = entries.map((e) => {
      const data = (e.entryData ?? {}) as Record<string, unknown>;
      return [
        e.id,
        e.createdAt?.toISOString() ?? "",
        e.hold ? "yes" : "no",
        ...keys.map((k) => (data[k] != null ? String(data[k]) : "")),
      ];
    });

    const csv = [header.join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${registerKey}-export.csv"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
