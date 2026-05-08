import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { irExercises, irExerciseParticipants } from "@/db/schema";
import {
  authorizeIrRequest,
  bridgeErrorResponse,
  AddParticipantsRequestSchema,
  logIrAuditEvent,
} from "@/lib/ir-tabletop-bridge";

/**
 * GET /api/ir-tabletop/exercises/:id/participants
 *
 * List participants for an exercise.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeIrRequest(req, "");
    const { id } = await params;

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
    )[0];
    if (!exercise) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const rows = await db
      .select()
      .from(irExerciseParticipants)
      .where(eq(irExerciseParticipants.exerciseId, id));
    return NextResponse.json(rows);
  } catch (e) {
    return bridgeErrorResponse(e);
  }
}

/**
 * POST /api/ir-tabletop/exercises/:id/participants
 *
 * Add participants (with attendance attestation slots) to an exercise.
 * Tenant isolation: exercise must belong to the caller's org.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rawBody = await req.text();
    const auth = await authorizeIrRequest(req, rawBody);
    const body = AddParticipantsRequestSchema.parse(JSON.parse(rawBody));

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
    )[0];
    if (!exercise) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const inserted = await db
      .insert(irExerciseParticipants)
      .values(
        body.participants.map((p) => ({
          exerciseId: id,
          userId: p.userId,
          name: p.name,
          organization: p.organization,
          title: p.title ?? null,
          role: p.role,
          email: p.email ?? null,
        }))
      )
      .returning();

    await logIrAuditEvent({
      organizationId: auth.organizationId,
      userId: auth.userId,
      action: "participants_added",
      resourceType: "ir_exercise",
      resourceId: id,
      details: { count: inserted.length },
      req,
    });

    return NextResponse.json(inserted, { status: 201 });
  } catch (e) {
    return bridgeErrorResponse(e);
  }
}
