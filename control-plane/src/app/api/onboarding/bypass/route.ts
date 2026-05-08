import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { onboardingWizardState } from "@/db/schema";
import { eq } from "drizzle-orm";

// ────────────────────────────────────────────────────────────────────────────
// Admin-only onboarding bypass
//
// Allows specific admin users to skip the 10-phase Vault wizard and jump
// straight to the dashboard. Used for internal testing / dashboard exploration
// without needing to drive the full wizard each time.
//
// Locked to a hard-coded email allowlist — never trust client-side claims.
// ────────────────────────────────────────────────────────────────────────────

const BYPASS_ALLOWED_EMAILS = new Set<string>([
  "patrick@mactechsolutionsllc.com",
]);

const ALL_PHASES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export async function POST() {
  const session = await auth();
  const user = session?.user as
    | { email?: string | null; organizationId?: string }
    | undefined;

  const email = user?.email?.toLowerCase() ?? "";
  const orgId = user?.organizationId;

  if (!orgId) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  if (!BYPASS_ALLOWED_EMAILS.has(email)) {
    return NextResponse.json(
      { error: "This account is not permitted to bypass onboarding." },
      { status: 403 },
    );
  }

  const now = new Date();

  // Upsert the wizard state row — mark all 10 phases complete and set completedAt
  const [existing] = await db
    .select({ id: onboardingWizardState.id })
    .from(onboardingWizardState)
    .where(eq(onboardingWizardState.organizationId, orgId))
    .limit(1);

  if (existing) {
    await db
      .update(onboardingWizardState)
      .set({
        currentPhase: 9,
        completedPhases: ALL_PHASES,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(onboardingWizardState.organizationId, orgId));
  } else {
    await db.insert(onboardingWizardState).values({
      organizationId: orgId,
      currentPhase: 9,
      completedPhases: ALL_PHASES,
      phaseData: { bypassed: true },
      completedAt: now,
    });
  }

  return NextResponse.json({ success: true, bypassedAt: now.toISOString() });
}
