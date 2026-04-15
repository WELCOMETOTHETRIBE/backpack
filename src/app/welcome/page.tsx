import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { onboardingWizardState } from "@/db/schema";
import { eq } from "drizzle-orm";
import { VaultOnboardingWizard } from "@/components/onboarding/VaultOnboardingWizard";

export default async function WelcomePage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  // If wizard was fully completed, go to dashboard
  const [wizardState] = await db
    .select({ completedAt: onboardingWizardState.completedAt })
    .from(onboardingWizardState)
    .where(eq(onboardingWizardState.organizationId, orgId))
    .limit(1);

  if (wizardState?.completedAt) redirect("/dashboard");

  return <VaultOnboardingWizard />;
}
