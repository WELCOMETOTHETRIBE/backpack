import { NextResponse, type NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { irAars, irExercises, irFindings } from "@/db/schema"
import {
  authorizeIrRequest,
  bridgeErrorResponse,
  logIrAuditEvent,
  UpdateFindingRequestSchema,
} from "@/lib/ir-tabletop-bridge"

/**
 * PATCH /api/ir-tabletop/findings/:findingId
 *
 * Update a finding's fields. Tenant isolation: finding -> aar -> exercise -> org
 * chain must resolve to the caller's org or 404.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ findingId: string }> }
) {
  try {
    const { findingId } = await params
    const rawBody = await req.text()
    const auth = await authorizeIrRequest(req, rawBody)
    const body = UpdateFindingRequestSchema.parse(JSON.parse(rawBody))

    // Verify ownership through join: finding -> aar -> exercise -> org
    const owner = (
      await db
        .select({
          findingId: irFindings.id,
          aarId: irAars.id,
          exerciseId: irExercises.id,
          orgId: irExercises.organizationId,
        })
        .from(irFindings)
        .innerJoin(irAars, eq(irAars.id, irFindings.aarId))
        .innerJoin(irExercises, eq(irExercises.id, irAars.exerciseId))
        .where(
          and(
            eq(irFindings.id, findingId),
            eq(irExercises.organizationId, auth.organizationId)
          )
        )
        .limit(1)
    )[0]
    if (!owner) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const updates: Partial<typeof irFindings.$inferInsert> = {
      updatedAt: new Date(),
    }
    if (body.controlId !== undefined) updates.controlId = body.controlId
    if (body.severity !== undefined) updates.severity = body.severity
    if (body.title !== undefined) updates.title = body.title
    if (body.description !== undefined) updates.description = body.description

    const [updated] = await db
      .update(irFindings)
      .set(updates)
      .where(eq(irFindings.id, findingId))
      .returning()

    await logIrAuditEvent({
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: "finding_updated",
      resourceType: "ir_finding",
      resourceId: findingId,
      details: {
        exerciseId: owner.exerciseId,
        aarId: owner.aarId,
        fieldsChanged: Object.keys(updates).filter((k) => k !== "updatedAt"),
      },
      req,
    })

    return NextResponse.json(updated)
  } catch (e) {
    return bridgeErrorResponse(e)
  }
}
