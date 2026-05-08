import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ScopingWizardClient } from "./ScopingWizardClient";

export default async function BoundaryScopingPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const [org] = await db
    .select({
      systemName: organizations.systemName,
      systemDescription: organizations.systemDescription,
      authorizationBoundaryStatement: organizations.authorizationBoundaryStatement,
      systemOwnerName: organizations.systemOwnerName,
      systemOwnerEmail: organizations.systemOwnerEmail,
      issoName: organizations.issoName,
      issoEmail: organizations.issoEmail,
      cuiCategories: organizations.cuiCategories,
      externalServiceProviders: organizations.externalServiceProviders,
      boundaryNarrative: organizations.boundaryNarrative,
      boundaryScopingCompletedAt: organizations.boundaryScopingCompletedAt,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) redirect("/auth/signin");

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Link
            href="/dashboard/boundary"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--color-gray-500)] hover:text-[var(--color-gray-700)] transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            System Boundary
          </Link>
          <h1 className="mt-3 text-3xl font-bold text-[var(--color-gray-900)]">
            Boundary Scoping Wizard
          </h1>
          <p className="mt-2 text-[var(--color-gray-600)]">
            Define your CUI system boundary for the System Security Plan. Work through each section — your progress is saved automatically.
          </p>
        </div>
        <ScopingWizardClient initialData={org} />
      </div>
    </div>
  );
}
