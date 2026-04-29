import { NextResponse, type NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { irExercises, organizations } from "@/db/schema"
import {
  authorizeIrRequest,
  bridgeErrorResponse,
  logIrAuditEvent,
} from "@/lib/ir-tabletop-bridge"

/**
 * POST /api/ir-tabletop/exercises/:id/start-execution
 *
 * Marks the exercise as started: sets executed_at = now() (if not already set)
 * and transitions status: draft|scheduled → in_progress. Recomputes
 * retention_until anchored to executed_at when this is the first execution
 * (matches PATCH semantics; gives the C3PAO a defensible execution-anchored
 * retention floor).
 *
 * Idempotent — if the exercise is already in_progress / executed / further
 * along, returns the current state without changes.
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

    // If already past start, return as-is (idempotent).
    if (
      existing.status !== "draft" &&
      existing.status !== "scheduled"
    ) {
      return NextResponse.json({
        exercise: existing,
        alreadyStarted: true,
      })
    }

    const now = new Date()
    const updates: Partial<typeof irExercises.$inferInsert> = {
      status: "in_progress",
      updatedAt: now,
    }

    // Anchor executed_at + retention to the actual start time.
    if (!existing.executedAt) {
      updates.executedAt = now
      const org = (
        await db
          .select({ years: organizations.defaultIrRetentionYears })
          .from(organizations)
          .where(eq(organizations.id, auth.organizationId))
          .limit(1)
      )[0]
      const retentionYears = org?.years ?? 6
      const retention = new Date(now)
      retention.setUTCFullYear(retention.getUTCFullYear() + retentionYears)
      updates.retentionUntil = retention.toISOString().slice(0, 10)
    }

    const [updated] = await db
      .update(irExercises)
      .set(updates)
      .where(eq(irExercises.id, id))
      .returning()

    await logIrAuditEvent({
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: "exercise_started",
      resourceType: "ir_exercise",
      resourceId: id,
      details: {
        executedAt: updated.executedAt?.toISOString(),
        retentionUntil: updated.retentionUntil,
        anchoredRetention: !existing.executedAt,
      },
      req,
    })

    return NextResponse.json({ exercise: updated, alreadyStarted: false })
  } catch (e) {
    return bridgeErrorResponse(e)
  }
}
