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
  DraftAarRequestSchema,
} from "@/lib/ir-tabletop-bridge"

/**
 * GET /api/ir-tabletop/exercises/:id/aar
 *
 * Returns the AAR (with findings + corrective actions) or 404 if not yet drafted.
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

    const aar = (
      await db.select().from(irAars).where(eq(irAars.exerciseId, id)).limit(1)
    )[0]
    if (!aar) {
      return NextResponse.json({ error: "AAR not drafted yet" }, { status: 404 })
    }

    const findings = await db
      .select()
      .from(irFindings)
      .where(eq(irFindings.aarId, aar.id))

    const findingIds = findings.map((f) => f.id)
    const cars = findingIds.length
      ? await db
          .select()
          .from(irCorrectiveActions)
          .where(eq(irCorrectiveActions.findingId, findingIds[0]))
      : []
    // For multi-finding fetch we need an inArray; do a second pass for safety.
    const allCars = await Promise.all(
      findings.map(async (f) =>
        db
          .select()
          .from(irCorrectiveActions)
          .where(eq(irCorrectiveActions.findingId, f.id))
      )
    )

    return NextResponse.json({
      aar,
      findings: findings.map((f, i) => ({
        ...f,
        correctiveActions: allCars[i] ?? [],
      })),
    })
  } catch (e) {
    return bridgeErrorResponse(e)
  }
}

/**
 * POST /api/ir-tabletop/exercises/:id/aar
 *
 * Upsert the AAR (one per exercise). Findings + their inline corrective actions
 * are FULL REPLACED on every draft (delete-then-insert). drafted_by_user_id is
 * recorded from the authenticated user.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const rawBody = await req.text()
    const auth = await authorizeIrRequest(req, rawBody)
    const body = DraftAarRequestSchema.parse(JSON.parse(rawBody))

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

    if (!auth.userId) {
      return NextResponse.json(
        {
          error:
            "Drafter user could not be resolved. Pass X-IR-Bridge-User-Email or sign in via Clerk.",
        },
        { status: 422 }
      )
    }

    const result = await db.transaction(async (tx) => {
      const [aar] = await tx
        .insert(irAars)
        .values({
          exerciseId: id,
          executiveSummary: body.executiveSummary,
          timelineNarrative: body.timelineNarrative,
          strengths: body.strengths ?? null,
          gaps: body.gaps ?? null,
          evidenceReviewed: body.evidenceReviewed ?? null,
          finalResult: body.finalResult,
          draftedByUserId: auth.userId,
          draftedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: irAars.exerciseId,
          set: {
            executiveSummary: body.executiveSummary,
            timelineNarrative: body.timelineNarrative,
            strengths: body.strengths ?? null,
            gaps: body.gaps ?? null,
            evidenceReviewed: body.evidenceReviewed ?? null,
            finalResult: body.finalResult,
            draftedByUserId: auth.userId,
            draftedAt: new Date(),
            updatedAt: new Date(),
            // Re-drafting clears prior approval — approver must re-approve.
            approvedByUserId: null,
            approvedAt: null,
            approvalSignatureRef: null,
          },
        })
        .returning()

      // Replace findings (and cascade their corrective actions via FK ON DELETE CASCADE).
      await tx.delete(irFindings).where(eq(irFindings.aarId, aar.id))

      if (body.findings.length === 0) {
        // Also transition exercise status to "aar_drafted" on first non-empty draft.
        await tx
          .update(irExercises)
          .set({ status: "aar_drafted", updatedAt: new Date() })
          .where(eq(irExercises.id, id))
        return { aar, findings: [] }
      }

      const insertedFindings = await tx
        .insert(irFindings)
        .values(
          body.findings.map((f) => ({
            aarId: aar.id,
            controlId: f.controlId,
            severity: f.severity,
            title: f.title,
            description: f.description,
          }))
        )
        .returning()

      const carInserts = body.findings
        .map((f, i) =>
          f.correctiveAction
            ? {
                findingId: insertedFindings[i].id,
                weakness: f.correctiveAction.weakness,
                controlReference: f.correctiveAction.controlReference,
                resourcesRequired:
                  f.correctiveAction.resourcesRequired ?? null,
                scheduledCompletionDate:
                  f.correctiveAction.scheduledCompletionDate ?? null,
                status: f.correctiveAction.status ?? "open",
                ownerName: f.correctiveAction.ownerName ?? null,
                notes: f.correctiveAction.notes ?? null,
              }
            : null
        )
        .filter((x): x is NonNullable<typeof x> => x !== null)

      if (carInserts.length > 0) {
        await tx.insert(irCorrectiveActions).values(carInserts)
      }

      await tx
        .update(irExercises)
        .set({ status: "aar_drafted", updatedAt: new Date() })
        .where(eq(irExercises.id, id))

      return { aar, findings: insertedFindings }
    })

    return NextResponse.json(result, { status: 200 })
  } catch (e) {
    return bridgeErrorResponse(e)
  }
}
