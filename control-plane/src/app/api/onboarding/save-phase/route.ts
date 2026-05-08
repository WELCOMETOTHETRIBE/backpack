import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { db } from "@/db";
import { onboardingWizardState } from "@/db/schema";
import { eq } from "drizzle-orm";

const requestSchema = z.object({
  phase: z.number().int().min(0).max(9),
  data: z.record(z.string(), z.unknown()),
  // When true, also stamps completed_at — used when the final phase finishes.
  complete: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const orgId = await requireOrg();
    const body = await requestSchema.parseAsync(await req.json());

    const [existing] = await db
      .select()
      .from(onboardingWizardState)
      .where(eq(onboardingWizardState.organizationId, orgId))
      .limit(1);

    if (!existing) {
      // Create the state row if missing (shouldn't happen after Phase 0 accept, but be safe)
      await db.insert(onboardingWizardState).values({
        organizationId: orgId,
        currentPhase: body.phase + 1,
        completedPhases: [body.phase],
        phaseData: { [body.phase]: body.data },
        completedAt: body.complete ? new Date() : null,
      });

      return NextResponse.json({
        phase: body.phase + 1,
        completedPhases: [body.phase],
        phaseData: { [body.phase]: body.data },
        completed: body.complete === true,
      });
    }

    // Deep-merge phase data
    const existingPhaseData = (existing.phaseData as Record<string, unknown>) ?? {};
    const mergedPhaseData = {
      ...existingPhaseData,
      [body.phase]: {
        ...(existingPhaseData[body.phase] as Record<string, unknown> | undefined ?? {}),
        ...body.data,
      },
    };

    // Add phase to completedPhases if not already present
    const completedPhases = existing.completedPhases ?? [];
    const updatedCompletedPhases = completedPhases.includes(body.phase)
      ? completedPhases
      : [...completedPhases, body.phase].sort((a, b) => a - b);

    const newCurrentPhase = Math.max(existing.currentPhase, body.phase + 1);

    const now = new Date();
    await db
      .update(onboardingWizardState)
      .set({
        currentPhase: newCurrentPhase,
        completedPhases: updatedCompletedPhases,
        phaseData: mergedPhaseData,
        updatedAt: now,
        // Only stamp completed_at once — preserve the original completion timestamp
        // on re-submissions from edit mode.
        ...(body.complete && !existing.completedAt ? { completedAt: now } : {}),
      })
      .where(eq(onboardingWizardState.organizationId, orgId));

    return NextResponse.json({
      phase: newCurrentPhase,
      completedPhases: updatedCompletedPhases,
      phaseData: mergedPhaseData,
      completed: body.complete === true || !!existing.completedAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      );
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Unauthorized") ? 401 : message.includes("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
