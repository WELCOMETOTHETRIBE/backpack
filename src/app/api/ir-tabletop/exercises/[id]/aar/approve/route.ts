import { NextResponse, type NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { irAars, irExercises } from "@/db/schema"
import {
  authorizeIrRequest,
  bridgeErrorResponse,
  ApproveAarRequestSchema,
} from "@/lib/ir-tabletop-bridge"

/**
 * POST /api/ir-tabletop/exercises/:id/aar/approve
 *
 * Approve the AAR. Three-layer enforcement of executor != approver:
 *   1. Body's approverUserId must equal the authenticated user (caller cannot
 *      approve "as" someone else).
 *   2. Approver != drafter (application-level guard with a friendly 409).
 *   3. DB CHECK constraint `ir_aars_drafter_approver_distinct` (defense in depth).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const rawBody = await req.text()
    const auth = await authorizeIrRequest(req, rawBody)
    const body = ApproveAarRequestSchema.parse(JSON.parse(rawBody))

    if (!auth.userId) {
      return NextResponse.json(
        {
          error:
            "Approver user could not be resolved. Pass X-IR-Bridge-User-Email or sign in via Clerk.",
        },
        { status: 422 }
      )
    }
    if (body.approverUserId !== auth.userId) {
      return NextResponse.json(
        { error: "Approver in body must match the authenticated caller." },
        { status: 403 }
      )
    }

    const row = (
      await db
        .select({
          aarId: irAars.id,
          draftedByUserId: irAars.draftedByUserId,
        })
        .from(irAars)
        .innerJoin(irExercises, eq(irExercises.id, irAars.exerciseId))
        .where(
          and(
            eq(irAars.exerciseId, id),
            eq(irExercises.organizationId, auth.organizationId)
          )
        )
        .limit(1)
    )[0]
    if (!row) {
      return NextResponse.json({ error: "AAR not found" }, { status: 404 })
    }

    if (
      row.draftedByUserId &&
      row.draftedByUserId === body.approverUserId
    ) {
      return NextResponse.json(
        {
          error:
            "Approver must differ from drafter. C3PAO separation requirement; assign a different user to approve.",
        },
        { status: 409 }
      )
    }

    const result = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(irAars)
        .set({
          approvedByUserId: body.approverUserId,
          approvedAt: new Date(),
          approvalSignatureRef: body.approvalSignatureRef,
          updatedAt: new Date(),
        })
        .where(eq(irAars.id, row.aarId))
        .returning()

      await tx
        .update(irExercises)
        .set({ status: "approved", updatedAt: new Date() })
        .where(eq(irExercises.id, id))

      return updated
    })

    return NextResponse.json(result, { status: 200 })
  } catch (e) {
    return bridgeErrorResponse(e)
  }
}
