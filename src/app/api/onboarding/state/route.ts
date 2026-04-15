import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth";
import { db } from "@/db";
import { onboardingWizardState } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const orgId = await requireOrg();

    const [state] = await db
      .select()
      .from(onboardingWizardState)
      .where(eq(onboardingWizardState.organizationId, orgId))
      .limit(1);

    if (!state) {
      return NextResponse.json({
        phase: 0,
        completedPhases: [],
        phaseData: {},
        completedAt: null,
      });
    }

    return NextResponse.json({
      phase: state.currentPhase,
      completedPhases: state.completedPhases ?? [],
      phaseData: state.phaseData ?? {},
      sprsScoreSnapshot: state.sprsScoreSnapshot,
      completedAt: state.completedAt?.toISOString() ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
