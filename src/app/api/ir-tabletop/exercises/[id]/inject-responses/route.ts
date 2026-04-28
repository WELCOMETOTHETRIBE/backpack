import { NextResponse, type NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import {
  irExercises,
  irInjectResponses,
} from "@/db/schema"
import {
  authorizeIrRequest,
  bridgeErrorResponse,
  RecordInjectResponsesRequestSchema,
} from "@/lib/ir-tabletop-bridge"

/**
 * GET /api/ir-tabletop/exercises/:id/inject-responses
 *
 * List captured inject responses for an exercise.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeIrRequest(req, "")
    const { id } = await params

    const exercise = (
      await db
        .select({ id: irExercises.id })
        .from(irExercises)
        .where(
          and(
            eq(irExercises.id, id),
            eq(irExercises.organizationId, auth.organizationId)
          )
        )
        .limit(1)
    )[0]
    if (!exercise) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const rows = await db
      .select()
      .from(irInjectResponses)
      .where(eq(irInjectResponses.exerciseId, id))
    return NextResponse.json(rows)
  } catch (e) {
    return bridgeErrorResponse(e)
  }
}

/**
 * POST /api/ir-tabletop/exercises/:id/inject-responses
 *
 * Bulk capture (idempotent upsert by exerciseId+injectKey). Each inject's
 * objective passCriteria — recorded at scenario seed time — is the basis for
 * the status field. recorded_by_user_id is set from the authenticated user.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const rawBody = await req.text()
    const auth = await authorizeIrRequest(req, rawBody)
    const body = RecordInjectResponsesRequestSchema.parse(JSON.parse(rawBody))

    const exercise = (
      await db
        .select({ id: irExercises.id })
        .from(irExercises)
        .where(
          and(
            eq(irExercises.id, id),
            eq(irExercises.organizationId, auth.organizationId)
          )
        )
        .limit(1)
    )[0]
    if (!exercise) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const persisted = await db.transaction(async (tx) => {
      const out: typeof irInjectResponses.$inferSelect[] = []
      for (const r of body.responses) {
        const decisionTs = r.decisionTimestamp
          ? new Date(r.decisionTimestamp)
          : null
        const [row] = await tx
          .insert(irInjectResponses)
          .values({
            exerciseId: id,
            injectKey: r.injectKey,
            injectPromptSnapshot: r.injectPromptSnapshot,
            expectedActionSnapshot: r.expectedActionSnapshot,
            status: r.status,
            actualResponseNotes: r.actualResponseNotes ?? null,
            decisionOffsetMinutes: r.decisionOffsetMinutes ?? null,
            decisionTimestamp: decisionTs,
            recordedByUserId: auth.userId,
          })
          .onConflictDoUpdate({
            target: [
              irInjectResponses.exerciseId,
              irInjectResponses.injectKey,
            ],
            set: {
              injectPromptSnapshot: r.injectPromptSnapshot,
              expectedActionSnapshot: r.expectedActionSnapshot,
              status: r.status,
              actualResponseNotes: r.actualResponseNotes ?? null,
              decisionOffsetMinutes: r.decisionOffsetMinutes ?? null,
              decisionTimestamp: decisionTs,
              recordedByUserId: auth.userId,
              updatedAt: new Date(),
            },
          })
          .returning()
        out.push(row)
      }
      return out
    })

    return NextResponse.json(persisted, { status: 200 })
  } catch (e) {
    return bridgeErrorResponse(e)
  }
}
