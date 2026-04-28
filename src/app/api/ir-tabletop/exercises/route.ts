import { NextResponse, type NextRequest } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import {
  irExercises,
  irExerciseControls,
  irScenarios,
  organizations,
} from "@/db/schema";
import {
  authorizeIrRequest,
  bridgeErrorResponse,
  CreateExerciseRequestSchema,
} from "@/lib/ir-tabletop-bridge";

/**
 * GET /api/ir-tabletop/exercises
 *
 * Lists exercises for the authenticated org (most recent first).
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeIrRequest(req, "");
    const rows = await db
      .select()
      .from(irExercises)
      .where(eq(irExercises.organizationId, auth.organizationId))
      .orderBy(desc(irExercises.createdAt));
    return NextResponse.json(rows);
  } catch (e) {
    return bridgeErrorResponse(e);
  }
}

/**
 * POST /api/ir-tabletop/exercises
 *
 * Create a new draft exercise from wizard inputs.
 *  - Snapshots the selected scenario into ir_exercises.scenario_snapshot_json
 *    (frozen at creation; immutable for the lifetime of the row).
 *  - Computes retention_until from organizations.default_ir_retention_years
 *    anchored to scheduledFor (or now() if not yet scheduled).
 *  - Inserts ir_exercise_controls rows from body.controlIds.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const auth = await authorizeIrRequest(req, rawBody);
    const body = CreateExerciseRequestSchema.parse(JSON.parse(rawBody));
    // If the caller asserts an organizationId in the body, it must match auth.
    if (body.organizationId && auth.organizationId !== body.organizationId) {
      return NextResponse.json(
        { error: "Tenant mismatch: header org != body organizationId" },
        { status: 403 }
      );
    }
    const organizationId = auth.organizationId;

    // Resolve org's default retention years for this exercise's retention floor.
    const org = (
      await db
        .select({ years: organizations.defaultIrRetentionYears })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1)
    )[0];
    const retentionYears = org?.years ?? 6;
    const anchor = body.scheduledFor ? new Date(body.scheduledFor) : new Date();
    const retention = new Date(anchor);
    retention.setUTCFullYear(retention.getUTCFullYear() + retentionYears);
    const retentionUntil = retention.toISOString().slice(0, 10);

    // Verify scenario exists and snapshot it.
    const scenario = (
      await db
        .select()
        .from(irScenarios)
        .where(eq(irScenarios.id, body.scenarioId))
        .limit(1)
    )[0];
    if (!scenario) {
      return NextResponse.json(
        { error: `Scenario ${body.scenarioId} not found` },
        { status: 422 }
      );
    }

    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(irExercises)
        .values({
          organizationId,
          boundaryId: body.boundaryId ?? null,
          scenarioId: body.scenarioId,
          scenarioSnapshotJson: {
            code: scenario.code,
            version: scenario.version,
            title: scenario.title,
            summary: scenario.summary,
            narrative: scenario.narrative,
            targetedControlIds: scenario.targetedControlIds,
            defaultRoe: scenario.defaultRoe,
            injectsJson: scenario.injectsJson,
          },
          name: body.name,
          methodology: body.methodology,
          methodologyJustification: body.methodologyJustification,
          scopeStatement: body.scopeStatement,
          cuiCategories: body.cuiCategories ?? [],
          customerName: body.customerName,
          contractProgramName: body.contractProgramName ?? null,
          systemName: body.systemName,
          environmentDescription: body.environmentDescription,
          reportingAuthoritiesJson: body.reportingAuthorities,
          scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
          status: "draft",
          retentionUntil,
          createdByUserId: auth.userId,
        })
        .returning();

      if (body.controlIds.length > 0) {
        await tx.insert(irExerciseControls).values(
          body.controlIds.map((c) => ({
            exerciseId: row.id,
            controlId: c.controlId,
            isPrimary: c.isPrimary ?? false,
          }))
        );
      }

      return row;
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return bridgeErrorResponse(e);
  }
}
