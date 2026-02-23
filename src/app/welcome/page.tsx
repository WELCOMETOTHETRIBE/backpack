import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { boundaryProfiles, controlRecords } from "@/db/schema";
import { eq } from "drizzle-orm";
import { WelcomeQuestionnaire } from "@/components/welcome/WelcomeQuestionnaire";

export default async function WelcomePage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  // If org has already completed onboarding, redirect to dashboard
  const [boundaryRow] = await db
    .select({ id: boundaryProfiles.id })
    .from(boundaryProfiles)
    .where(eq(boundaryProfiles.organizationId, orgId))
    .limit(1);
  const [controlRecord] = await db
    .select({ id: controlRecords.id })
    .from(controlRecords)
    .where(eq(controlRecords.organizationId, orgId))
    .limit(1);
  if (boundaryRow || controlRecord) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
        <WelcomeQuestionnaire />
      </div>
    </div>
  );
}
