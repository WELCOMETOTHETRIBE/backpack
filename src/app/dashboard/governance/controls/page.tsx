import Link from "next/link";
import GovernanceControlsClient from "./GovernanceControlsClient";

export default function GovernanceControlsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/governance" className="text-sm text-[var(--color-gray-600)] hover:underline">
            ← Governance
          </Link>
          <h2 className="mt-1 text-xl font-semibold text-[var(--color-navy-primary)]">Governance controls</h2>
          <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">
            Pure and hybrid governance controls; filter by classification and status.
          </p>
        </div>
      </div>
      <GovernanceControlsClient />
    </div>
  );
}
