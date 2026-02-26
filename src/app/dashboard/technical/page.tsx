import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { TechnicalDashboardClient } from "./TechnicalDashboardClient";

export default async function TechnicalOnboardingPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  if (!user?.organizationId) redirect("/auth/signin");

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-5xl space-y-6">
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
              OS Baselines (assets)
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
