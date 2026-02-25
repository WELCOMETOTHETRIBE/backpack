import { NextResponse } from "next/server";
import { db } from "@/db";
import { sspSections } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
    const { searchParams } = new URL(req.url);
    const documentCode = searchParams.get("documentCode");
    let rows = await db.select().from(sspSections).where(eq(sspSections.organizationId, orgId));
    if (documentCode) rows = rows.filter((r) => r.documentCode === documentCode);
    return NextResponse.json(rows);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance"]);
    const body = await req.json();
    const { documentCode, sectionKey, title, content, orderIndex } = body;
    if (!documentCode || !sectionKey || !title) {
      return NextResponse.json(
        { error: "documentCode, sectionKey, title required" },
        { status: 400 }
      );
    }
    const [row] = await db
      .insert(sspSections)
      .values({
        organizationId: orgId,
        documentCode,
        sectionKey,
        title,
        content: content ?? null,
        orderIndex: orderIndex ?? 0,
      })
      .returning();
    return NextResponse.json(row);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
