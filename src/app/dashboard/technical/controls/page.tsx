import Link from "next/link";
import GovernanceControlsClient from "@/app/dashboard/governance/controls/GovernanceControlsClient";

export default function TechnicalControlsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/technical" className="text-sm text-[var(--color-gray-600)] hover:underline">
            ← Technical
          </Link>
          <h2 className="mt-1 text-xl font-semibold text-[var(--color-navy-primary)]">Technical controls</h2>
          <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">
            Pure and hybrid technical controls; filter by classification and status.
          </p>
        </div>
      </div>
      <GovernanceControlsClient basePath="/dashboard/technical/controls" />
    </div>
  );
}
