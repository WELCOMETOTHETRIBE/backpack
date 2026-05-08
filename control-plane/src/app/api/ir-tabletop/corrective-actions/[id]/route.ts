import { NextResponse, type NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import {
  irAars,
  irCorrectiveActions,
  irExercises,
  irFindings,
} from "@/db/schema"
import {
  authorizeIrRequest,
  bridgeErrorResponse,
  logIrAuditEvent,
  UpdateCorrectiveActionRequestSchema,
} from "@/lib/ir-tabletop-bridge"

/**
 * PATCH /api/ir-tabletop/corrective-actions/:id
 *
 * Update a CAR row's fields (typically status as work progresses). Tenant
 * isolation: CAR -> finding -> aar -> exercise -> org chain must resolve to
 * the caller's org or 404. closed_at is auto-set when status transitions to
 * 'completed'.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const rawBody = await req.text()
    const auth = await authorizeIrRequest(req, rawBody)
    const body = UpdateCorrectiveActionRequestSchema.parse(JSON.parse(rawBody))

    const owner = (
      await db
        .select({
          carId: irCorrectiveActions.id,
          existingStatus: irCorrectiveActions.status,
          findingId: irFindings.id,
          aarId: irAars.id,
          exerciseId: irExercises.id,
          orgId: irExercises.organizationId,
        })
        .from(irCorrectiveActions)
        .innerJoin(irFindings, eq(irFindings.id, irCorrectiveActions.findingId))
        .innerJoin(irAars, eq(irAars.id, irFindings.aarId))
        .innerJoin(irExercises, eq(irExercises.id, irAars.exerciseId))
        .where(
          and(
            eq(irCorrectiveActions.id, id),
            eq(irExercises.organizationId, auth.organizationId)
          )
        )
        .limit(1)
    )[0]
    if (!owner) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const updates: Partial<typeof irCorrectiveActions.$inferInsert> = {
      updatedAt: new Date(),
    }
    if (body.weakness !== undefined) updates.weakness = body.weakness
    if (body.controlReference !== undefined)
      updates.controlReference = body.controlReference
    if (body.resourcesRequired !== undefined)
      updates.resourcesRequired = body.resourcesRequired ?? null
    if (body.scheduledCompletionDate !== undefined)
      updates.scheduledCompletionDate =
        body.scheduledCompletionDate ?? null
    if (body.ownerName !== undefined) updates.ownerName = body.ownerName ?? null
    if (body.notes !== undefined) updates.notes = body.notes ?? null
    if (body.status !== undefined) {
      updates.status = body.status
      // Auto-set closed_at on first transition into 'completed'
      if (body.status === "completed" && owner.existingStatus !== "completed") {
        updates.closedAt = new Date()
      }
      // Auto-clear closed_at when re-opening a completed CAR
      if (body.status !== "completed" && owner.existingStatus === "completed") {
        updates.closedAt = null
      }
    }

    const [updated] = await db
      .update(irCorrectiveActions)
      .set(updates)
      .where(eq(irCorrectiveActions.id, id))
      .returning()

    await logIrAuditEvent({
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: "corrective_action_updated",
      resourceType: "ir_corrective_action",
      resourceId: id,
      details: {
        exerciseId: owner.exerciseId,
        findingId: owner.findingId,
        statusFrom: owner.existingStatus,
        statusTo: body.status ?? owner.existingStatus,
        fieldsChanged: Object.keys(updates).filter(
          (k) => k !== "updatedAt"
        ),
      },
      req,
    })

    return NextResponse.json(updated)
  } catch (e) {
    return bridgeErrorResponse(e)
  }
}
