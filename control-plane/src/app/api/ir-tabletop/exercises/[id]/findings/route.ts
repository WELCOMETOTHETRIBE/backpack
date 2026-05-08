import { NextResponse, type NextRequest } from "next/server"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/db"
import {
  irAars,
  irCorrectiveActions,
  irExercises,
  irFindings,
} from "@/db/schema"
import {
  AddFindingsRequestSchema,
  authorizeIrRequest,
  bridgeErrorResponse,
} from "@/lib/ir-tabletop-bridge"

/**
 * GET /api/ir-tabletop/exercises/:id/findings
 *
 * Returns findings (with their corrective actions) for the exercise's AAR.
 * Empty array if no AAR exists yet.
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
    if (!aar) return NextResponse.json([])

    const findings = await db
      .select()
      .from(irFindings)
      .where(eq(irFindings.aarId, aar.id))

    const findingIds = findings.map((f) => f.id)
    const cars =
      findingIds.length > 0
        ? await db
            .select()
            .from(irCorrectiveActions)
            .where(inArray(irCorrectiveActions.findingId, findingIds))
        : []

    const carsByFinding = new Map<string, typeof cars>()
    for (const c of cars) {
      const list = carsByFinding.get(c.findingId) ?? []
      list.push(c)
      carsByFinding.set(c.findingId, list)
    }

    return NextResponse.json(
      findings.map((f) => ({
        ...f,
        correctiveActions: carsByFinding.get(f.id) ?? [],
      }))
    )
  } catch (e) {
    return bridgeErrorResponse(e)
  }
}

/**
 * POST /api/ir-tabletop/exercises/:id/findings
 *
 * Add findings (and optional inline corrective actions) to an existing AAR.
 * Requires the AAR to be drafted first; returns 409 if no AAR exists.
 * Findings are appended (not replaced) — distinct from POST /aar which replaces.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const rawBody = await req.text()
    const auth = await authorizeIrRequest(req, rawBody)
    const body = AddFindingsRequestSchema.parse(JSON.parse(rawBody))

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
      return NextResponse.json(
        {
          error:
            "Cannot add findings before the AAR is drafted. Draft the AAR via POST /aar first.",
        },
        { status: 409 }
      )
    }

    const result = await db.transaction(async (tx) => {
      const inserted = await tx
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

      const carRows = body.findings
        .map((f, i) =>
          f.correctiveAction
            ? {
                findingId: inserted[i].id,
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

      if (carRows.length > 0) {
        await tx.insert(irCorrectiveActions).values(carRows)
      }

      return inserted
    })

    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    return bridgeErrorResponse(e)
  }
}
