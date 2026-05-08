import { NextResponse } from "next/server";
import { db } from "@/db";
import { poamItems, poamClosureApprovals, attestations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);
    const { id } = await params;
    const body = await req.json();
    const { dataHash } = body ?? {};

    const [item] = await db
      .select()
      .from(poamItems)
      .where(
        and(eq(poamItems.id, id), eq(poamItems.organizationId, orgId))
      );
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (item.status === "Closed") {
      return NextResponse.json({ error: "POA&M already closed" }, { status: 400 });
    }

    const existingApprovals = await db
      .select()
      .from(poamClosureApprovals)
      .where(eq(poamClosureApprovals.poamItemId, id));

    const alreadyApproved = existingApprovals.some((a) => a.approverId === user.id);
    if (alreadyApproved) {
      return NextResponse.json({ error: "You have already signed off on this closure" }, { status: 400 });
    }

    const approvalOrder = existingApprovals.length + 1;
    await db.insert(poamClosureApprovals).values({
      poamItemId: id,
      approverId: user.id!,
      approvalOrder,
      signatureHash: dataHash ?? null,
    });

    await db.insert(attestations).values({
      organizationId: orgId,
      attestationType: "poam_closure",
      resourceType: "poam_item",
      resourceId: id,
      signatoryId: user.id!,
      dataHash: dataHash ?? null,
    });

    const updatedApprovals = await db
      .select()
      .from(poamClosureApprovals)
      .where(eq(poamClosureApprovals.poamItemId, id));

    if (updatedApprovals.length >= 2) {
      await db
        .update(poamItems)
        .set({ status: "Closed", closedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(poamItems.id, id), eq(poamItems.organizationId, orgId)));
    } else {
      await db
        .update(poamItems)
        .set({ status: "Pending Closure", updatedAt: new Date() })
        .where(and(eq(poamItems.id, id), eq(poamItems.organizationId, orgId)));
    }

    await writeAuditLog({
      organizationId: orgId,
      userId: user.id,
      action: "poam.closure_signoff",
      resourceType: "poam_item",
      resourceId: id,
      details: { approvalOrder },
    });

    return NextResponse.json({
      approvalOrder,
      totalApprovals: updatedApprovals.length,
      closed: updatedApprovals.length >= 2,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
