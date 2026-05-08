import { NextResponse, type NextRequest } from "next/server";
import { and, eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { irExerciseBundles, irExercises } from "@/db/schema";
import { authorizeIrRequest, bridgeErrorResponse } from "@/lib/ir-tabletop-bridge";

/**
 * GET /api/ir-tabletop/exercises/:id/manifest
 *
 * Returns the latest bundle manifest for an exercise (assessor-read).
 * 404 if the exercise has no bundle yet.
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
    if (!exercise) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const bundle = (
      await db
        .select()
        .from(irExerciseBundles)
        .where(eq(irExerciseBundles.exerciseId, id))
        .orderBy(desc(irExerciseBundles.bundleVersion))
        .limit(1)
    )[0];
    if (!bundle) {
      return NextResponse.json(
        { error: "No bundle generated for this exercise yet" },
        { status: 404 }
      );
    }

    return NextResponse.json(bundle);
  } catch (e) {
    return bridgeErrorResponse(e);
  }
}
