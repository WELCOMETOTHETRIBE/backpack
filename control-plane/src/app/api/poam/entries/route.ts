import { NextResponse } from "next/server";
import { db } from "@/db";
import { poamEntries, controlRecords } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

/**
 * GET /api/poam/entries — list POA&M entries for the org.
 * GET /api/poam/entries?controlRecordId=xxx — return the entry for that control record, or [].
 */
export async function GET(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const { searchParams } = new URL(req.url);
    const controlRecordId = searchParams.get("controlRecordId");

    if (controlRecordId) {
      const [entry] = await db
        .select()
        .from(poamEntries)
        .where(
          and(
            eq(poamEntries.controlRecordId, controlRecordId),
            eq(poamEntries.organizationId, orgId)
          )
        )
        .limit(1);
      return NextResponse.json(entry ?? null);
    }

    const entries = await db
      .select({
        id: poamEntries.id,
        controlRecordId: poamEntries.controlRecordId,
        controlId: controlRecords.controlId,
        status: poamEntries.status,
        weaknessDescription: poamEntries.weaknessDescription,
        scheduledCompletionDate: poamEntries.scheduledCompletionDate,
      })
      .from(poamEntries)
      .innerJoin(controlRecords, eq(poamEntries.controlRecordId, controlRecords.id))
      .where(eq(poamEntries.organizationId, orgId));

    return NextResponse.json(entries);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/poam/entries — create a POA&M entry for a control record (from wizard "Add to POA&M").
 * Body: { controlRecordId, weaknessDescription?, remediationPlan?, scheduledCompletionDate?, responsibleRoleId? }
 * If an entry already exists for this control record, returns it (200).
 */
export async function POST(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance"]);

    const body = await req.json();
    const controlRecordId = body.controlRecordId;
    if (!controlRecordId) {
      return NextResponse.json({ error: "controlRecordId required" }, { status: 400 });
    }

    const [record] = await db
      .select()
      .from(controlRecords)
      .where(
        and(
          eq(controlRecords.id, controlRecordId),
          eq(controlRecords.organizationId, orgId)
        )
      )
      .limit(1);
    if (!record) {
      return NextResponse.json({ error: "Control record not found" }, { status: 404 });
    }

    const [existing] = await db
      .select()
      .from(poamEntries)
      .where(
        and(
          eq(poamEntries.controlRecordId, controlRecordId),
          eq(poamEntries.organizationId, orgId)
        )
      )
      .limit(1);
    if (existing) {
      return NextResponse.json(existing);
    }

    const [inserted] = await db
      .insert(poamEntries)
      .values({
        organizationId: orgId,
        controlRecordId,
        weaknessDescription: body.weaknessDescription ?? null,
        remediationPlan: body.remediationPlan ?? null,
        scheduledCompletionDate: body.scheduledCompletionDate ?? null,
        responsibleRoleId: body.responsibleRoleId ?? null,
      })
      .returning();

    return NextResponse.json(inserted);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create POA&M entry";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
