import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { VaultOnboardingWizard } from "@/components/onboarding/VaultOnboardingWizard";

export default async function WelcomePage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  // Always render the Vault wizard — it handles resuming & completed state internally
  return <VaultOnboardingWizard />;
}
