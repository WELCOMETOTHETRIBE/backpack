import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { VaultOnboardingWizard } from "@/components/onboarding/VaultOnboardingWizard";

// Admin-only onboarding bypass allowlist — mirrors the server-side check in
// /api/onboarding/bypass. Keep the two lists in sync.
const BYPASS_ALLOWED_EMAILS = new Set<string>([
  "patrick@mactechsolutionsllc.com",
]);

export default async function WelcomePage() {
  const session = await auth();
  const user = session?.user as
    | { email?: string | null; organizationId?: string }
    | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const email = user?.email?.toLowerCase() ?? "";
  const allowBypass = BYPASS_ALLOWED_EMAILS.has(email);

  // Always render the Vault wizard — it handles resuming & completed state internally
  return <VaultOnboardingWizard allowBypass={allowBypass} />;
}
