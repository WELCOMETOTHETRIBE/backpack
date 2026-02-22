import { NextResponse } from "next/server";
import { db } from "@/db";
import { poamItems, controlImplementations, controls, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function GET(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
    const { searchParams } = new URL(req.url);
    const aging = searchParams.get("aging") === "true";

    let items = await db
      .select({
        id: poamItems.id,
        poamId: poamItems.poamId,
        title: poamItems.title,
        status: poamItems.status,
        riskSeverity: poamItems.riskSeverity,
        targetCompletionDate: poamItems.targetCompletionDate,
        controlId: controls.controlId,
        controlTitle: controls.title,
      })
      .from(poamItems)
      .innerJoin(controlImplementations, eq(poamItems.controlImplementationId, controlImplementations.id))
      .innerJoin(controls, eq(controlImplementations.controlId, controls.id))
      .where(eq(poamItems.organizationId, orgId));

    if (aging) {
      const now = new Date();
      items = items.filter(
        (i) => i.status !== "Closed" && new Date(i.targetCompletionDate) < now
      );
    }

    return NextResponse.json(items);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);
    const body = await req.json();
    const {
      controlImplementationId,
      poamId,
      title,
      description,
      rootCause,
      riskSeverity,
      targetCompletionDate,
      responsiblePartyId,
    } = body;
    if (!controlImplementationId || !poamId || !title || !targetCompletionDate) {
      return NextResponse.json(
        { error: "controlImplementationId, poamId, title, targetCompletionDate required" },
        { status: 400 }
      );
    }
    const [existing] = await db
      .select()
      .from(controlImplementations)
      .where(
        and(
          eq(controlImplementations.id, controlImplementationId),
          eq(controlImplementations.organizationId, orgId)
        )
      );
    if (!existing) return NextResponse.json({ error: "Control implementation not found" }, { status: 404 });

    const [row] = await db
      .insert(poamItems)
      .values({
        organizationId: orgId,
        controlImplementationId,
        poamId,
        title,
        description: description ?? null,
        rootCause: rootCause ?? null,
        riskSeverity: riskSeverity ?? "Medium",
        targetCompletionDate: new Date(targetCompletionDate),
        responsiblePartyId: responsiblePartyId ?? null,
      })
      .returning();

    await writeAuditLog({
      organizationId: orgId,
      userId: user.id,
      action: "poam.create",
      resourceType: "poam_item",
      resourceId: row?.id,
    });
    return NextResponse.json(row);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
