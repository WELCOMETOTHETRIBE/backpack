import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  irExercises,
  irExerciseControls,
  organizations,
} from "@/db/schema";
import {
  authorizeIrRequest,
  bridgeErrorResponse,
  UpdateExerciseRequestSchema,
} from "@/lib/ir-tabletop-bridge";

/**
 * GET /api/ir-tabletop/exercises/:id
 *
 * Returns a single exercise scoped to the caller's org.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeIrRequest(req, "");
    const { id } = await params;
    const row = (
      await db
        .select()
        .from(irExercises)
        .where(
          and(
            eq(irExercises.id, id),
            eq(irExercises.organizationId, auth.organizationId)
          )
        )
        .limit(1)
    )[0];
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(row);
  } catch (e) {
    return bridgeErrorResponse(e);
  }
}

/**
 * PATCH /api/ir-tabletop/exercises/:id
 *
 * Update wizard inputs on an exercise. Special handling:
 *  - If executedAt transitions from null → set, retention_until is recomputed
 *    from organizations.default_ir_retention_years anchored to executedAt.
 *  - controlIds, when provided, replace the link table entries (full overwrite).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rawBody = await req.text();
    const auth = await authorizeIrRequest(req, rawBody);
    const body = UpdateExerciseRequestSchema.parse(JSON.parse(rawBody));

    const existing = (
      await db
        .select()
        .from(irExercises)
        .where(
          and(
            eq(irExercises.id, id),
            eq(irExercises.organizationId, auth.organizationId)
          )
        )
        .limit(1)
    )[0];
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updates: Partial<typeof irExercises.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (body.boundaryId !== undefined) updates.boundaryId = body.boundaryId;
    if (body.name !== undefined) updates.name = body.name;
    if (body.methodology !== undefined) updates.methodology = body.methodology;
    if (body.methodologyJustification !== undefined)
      updates.methodologyJustification = body.methodologyJustification;
    if (body.scopeStatement !== undefined) updates.scopeStatement = body.scopeStatement;
    if (body.cuiCategories !== undefined) updates.cuiCategories = body.cuiCategories;
    if (body.customerName !== undefined) updates.customerName = body.customerName;
    if (body.contractProgramName !== undefined)
      updates.contractProgramName = body.contractProgramName;
    if (body.systemName !== undefined) updates.systemName = body.systemName;
    if (body.environmentDescription !== undefined)
      updates.environmentDescription = body.environmentDescription;
    if (body.reportingAuthorities !== undefined)
      updates.reportingAuthoritiesJson = body.reportingAuthorities;
    if (body.scheduledFor !== undefined) {
      updates.scheduledFor = body.scheduledFor ? new Date(body.scheduledFor) : null;
    }
    if (body.facilitatorUserId !== undefined)
      updates.facilitatorUserId = body.facilitatorUserId;
    if (body.approverUserId !== undefined) updates.approverUserId = body.approverUserId;
    if (body.plannerNotes !== undefined) updates.plannerNotes = body.plannerNotes;
    if (body.difficulty !== undefined) updates.difficulty = body.difficulty;

    // executedAt + retention recompute when transitioning from unset → set.
    if (body.executedAt !== undefined) {
      const newExecutedAt = body.executedAt ? new Date(body.executedAt) : null;
      updates.executedAt = newExecutedAt;
      if (newExecutedAt && !existing.executedAt) {
        const org = (
          await db
            .select({ years: organizations.defaultIrRetentionYears })
            .from(organizations)
            .where(eq(organizations.id, auth.organizationId))
            .limit(1)
        )[0];
        const years = org?.years ?? 6;
        const retention = new Date(newExecutedAt);
        retention.setUTCFullYear(retention.getUTCFullYear() + years);
        updates.retentionUntil = retention.toISOString().slice(0, 10);
      }
    }

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(irExercises)
        .set(updates)
        .where(eq(irExercises.id, id))
        .returning();

      if (body.controlIds && body.controlIds.length > 0) {
        await tx
          .delete(irExerciseControls)
          .where(eq(irExerciseControls.exerciseId, id));
        await tx.insert(irExerciseControls).values(
          body.controlIds.map((c) => ({
            exerciseId: id,
            controlId: c.controlId,
            isPrimary: c.isPrimary ?? false,
          }))
        );
      }

      return row;
    });

    return NextResponse.json(updated);
  } catch (e) {
    return bridgeErrorResponse(e);
  }
}
