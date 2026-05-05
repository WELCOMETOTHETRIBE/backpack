import { NextResponse } from "next/server";
import { db } from "@/db";
import { controlAttentionItems } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

/**
 * POST /api/control-attention/[itemId]/resolve
 *
 * Admin marks a control_attention_items row as resolved. Used by the
 * Monitoring tab's "Open admin actions" card.
 *
 * Auth: session, Admin or Compliance role.
 */

interface ResolveBody {
  resolution_note?: string;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string })?.organizationId;
  const userId = (session?.user as { id?: string })?.id;
  const userRole = (session?.user as { role?: string })?.role;

  if (!orgId || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (userRole !== "Admin" && userRole !== "Compliance") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { itemId } = await params;
  let body: ResolveBody = {};
  try {
    body = (await req.json()) as ResolveBody;
  } catch {
    // body optional
  }

  const [row] = await db
    .select({
      id: controlAttentionItems.id,
      orgId: controlAttentionItems.organizationId,
      resolvedAt: controlAttentionItems.resolvedAt,
    })
    .from(controlAttentionItems)
    .where(eq(controlAttentionItems.id, itemId))
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }
  if (row.orgId !== orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (row.resolvedAt) {
    return NextResponse.json(
      { error: "Item already resolved" },
      { status: 409 },
    );
  }

  const now = new Date();
  await db
    .update(controlAttentionItems)
    .set({
      resolvedAt: now,
      resolvedByUserId: userId,
      resolutionNote: body.resolution_note ?? null,
    })
    .where(
      and(
        eq(controlAttentionItems.id, itemId),
        eq(controlAttentionItems.organizationId, orgId),
      ),
    );

  console.log(
    JSON.stringify({
      event: "enclavewatch.control.attention_resolved",
      orgId,
      itemId,
      resolvedBy: userId,
    }),
  );

  try {
    await writeAuditLog({
      organizationId: orgId,
      userId,
      action: "enclavewatch.control.attention_resolved",
      resourceType: "control_attention_item",
      resourceId: itemId,
      details: {
        resolution_note: body.resolution_note ?? null,
      },
    });
  } catch {
    // No-op
  }

  return NextResponse.json({
    ok: true,
    item_id: itemId,
    resolved_at: now.toISOString(),
  });
}
