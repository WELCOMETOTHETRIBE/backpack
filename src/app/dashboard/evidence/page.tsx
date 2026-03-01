import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { osAssets } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { TechnicalDashboardClient } from "../technical/TechnicalDashboardClient";

export default async function EvidencePage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const assetCount = await db
    .select({ id: osAssets.id })
    .from(osAssets)
    .where(eq(osAssets.organizationId, orgId));
  const hasAssets = assetCount.length > 0;

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-5xl space-y-6">
        {!hasAssets && (
          <section className="rounded-[var(--radius-xl)] border border-[var(--color-status-amber)]/50 bg-[var(--color-status-amber)]/5 p-4">
            <p className="text-sm font-medium text-[var(--color-gray-800)]">
              Define your boundary and add endpoints in System Boundary first.
            </p>
            <p className="mt-1 text-sm text-[var(--color-gray-600)]">
              Add a boundary and endpoints with baseline profiles so evidence bundles can be scored against the right controls.
            </p>
            <Link
              href="/dashboard/os-baselines"
              className="mt-2 inline-block text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
            >
              Go to System Boundary →
            </Link>
          </section>
        )}
        <section className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-600)]">
            Technical control onboarding
          </h2>
          <p className="mt-1 text-sm text-[var(--color-gray-600)]">
            Upload evidence bundles; the system adjudicates control implementation status from required files and surfaces drift (regressions) vs the previous run.
          </p>
        </section>
        <TechnicalDashboardClient />
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">Quick actions</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/dashboard/technical/upload"
              className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2"
            >
              Upload evidence bundle
            </Link>
            <Link
              href="/dashboard/os-baselines"
              className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-medium text-[var(--color-gray-700)] transition-colors hover:bg-[var(--color-gray-50)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2"
            >
              System Boundary (endpoints)
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
