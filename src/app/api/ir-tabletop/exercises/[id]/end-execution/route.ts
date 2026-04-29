import { NextResponse, type NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { irExercises, irInjectResponses } from "@/db/schema"
import {
  authorizeIrRequest,
  bridgeErrorResponse,
  logIrAuditEvent,
} from "@/lib/ir-tabletop-bridge"

/**
 * POST /api/ir-tabletop/exercises/:id/end-execution
 *
 * Transitions exercise status: in_progress → executed. Idempotent if already
 * executed or further along. Records inject-response coverage in the audit
 * log so the C3PAO can later see "exercise ended with N of M injects covered".
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await authorizeIrRequest(req, "")

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
    )[0]
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    // Already at or past executed — return as-is.
    if (
      existing.status === "executed" ||
      existing.status === "aar_drafted" ||
      existing.status === "approved" ||
      existing.status === "archived"
    ) {
      return NextResponse.json({
        exercise: existing,
        alreadyEnded: true,
      })
    }

    // Coverage signal for the audit log
    const responses = await db
      .select({ status: irInjectResponses.status })
      .from(irInjectResponses)
      .where(eq(irInjectResponses.exerciseId, id))
    const statusHistogram = responses.reduce<Record<string, number>>(
      (acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1
        return acc
      },
      {}
    )

    const [updated] = await db
      .update(irExercises)
      .set({ status: "executed", updatedAt: new Date() })
      .where(eq(irExercises.id, id))
      .returning()

    await logIrAuditEvent({
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: "exercise_ended",
      resourceType: "ir_exercise",
      resourceId: id,
      details: {
        responseCount: responses.length,
        statusHistogram,
      },
      req,
    })

    return NextResponse.json({ exercise: updated, alreadyEnded: false })
  } catch (e) {
    return bridgeErrorResponse(e)
  }
}
