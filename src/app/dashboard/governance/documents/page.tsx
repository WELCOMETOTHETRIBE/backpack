import Link from "next/link";
import GovernanceDocumentsClient from "./GovernanceDocumentsClient";

export default function GovernanceDocumentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/governance" className="text-sm text-[var(--color-gray-600)] hover:underline">
            ← Governance
          </Link>
          <h2 className="mt-1 text-xl font-semibold text-[var(--color-navy-primary)]">Document control</h2>
          <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">
            Policies, SOPs, and plans; versioning and approval workflow. Upload and map to the governance matrix.
          </p>
        </div>
        <Link
          href="/dashboard/governance/documents/new"
          className="rounded-[var(--radius-md)] bg-[var(--color-blue-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          New document
        </Link>
      </div>
      <GovernanceDocumentsClient />
    </div>
  );
}
