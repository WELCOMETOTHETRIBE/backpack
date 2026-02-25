import Link from "next/link";
import EvidenceClient from "./EvidenceClient";

export default function GovernanceEvidencePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/governance" className="text-sm text-[var(--color-gray-600)] hover:underline">
            ← Governance
          </Link>
          <h2 className="mt-1 text-xl font-semibold text-[var(--color-navy-primary)]">Evidence library</h2>
          <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">
            Evidence items for hybrid controls; filter by type and view stale items.
          </p>
        </div>
        <Link
          href="/dashboard/governance/evidence/new"
          className="rounded-[var(--radius-md)] bg-[var(--color-blue-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Add evidence
        </Link>
      </div>
      <EvidenceClient />
    </div>
  );
}
