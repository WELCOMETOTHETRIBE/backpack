import { NextResponse } from "next/server";
import { auth, requireOrg } from "@/lib/auth";
import { db } from "@/db";
import { onboardingWizardState, organizations, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const orgId = await requireOrg();
    const session = await auth();
    const userId = (session?.user as { id?: string } | undefined)?.id;

    const [state, org, user] = await Promise.all([
      db
        .select()
        .from(onboardingWizardState)
        .where(eq(onboardingWizardState.organizationId, orgId))
        .limit(1)
        .then((rows) => rows[0]),
      db
        .select({
          name: organizations.name,
          cageCode: organizations.cageCode,
        })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1)
        .then((rows) => rows[0]),
      userId
        ? db
            .select({
              name: users.name,
              email: users.email,
            })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1)
            .then((rows) => rows[0])
        : Promise.resolve(undefined),
    ]);

    // Seed block the wizard uses to pre-fill Phase 1 with known-safe values
    // from the signup-time organization + user records. The customer can
    // still edit everything.
    const seed = {
      orgName: org?.name ?? "",
      cageCode: org?.cageCode ?? "",
      ownerName: user?.name ?? "",
      ownerEmail: user?.email ?? "",
    };

    if (!state) {
      return NextResponse.json({
        phase: 0,
        completedPhases: [],
        phaseData: {},
        completedAt: null,
        seed,
      });
    }

    return NextResponse.json({
      phase: state.currentPhase,
      completedPhases: state.completedPhases ?? [],
      phaseData: state.phaseData ?? {},
      sprsScoreSnapshot: state.sprsScoreSnapshot,
      completedAt: state.completedAt?.toISOString() ?? null,
      seed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
