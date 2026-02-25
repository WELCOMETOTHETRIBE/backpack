import Link from "next/link";
import EvidenceDetailClient from "./EvidenceDetailClient";

export default async function GovernanceEvidenceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/governance/evidence" className="text-sm text-[var(--color-gray-600)] hover:underline">
          ← Evidence library
        </Link>
        <h2 className="mt-1 text-xl font-semibold text-[var(--color-navy-primary)]">Evidence item</h2>
      </div>
      <EvidenceDetailClient evidenceId={id} />
    </div>
  );
}
