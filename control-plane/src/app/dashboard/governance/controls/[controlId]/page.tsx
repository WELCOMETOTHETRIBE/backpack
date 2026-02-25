import Link from "next/link";
import ControlDetailClient from "./ControlDetailClient";

export default async function GovernanceControlDetailPage({
  params,
}: {
  params: Promise<{ controlId: string }>;
}) {
  const { controlId } = await params;
  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/governance/controls" className="text-sm text-[var(--color-gray-600)] hover:underline">
          ← Governance controls
        </Link>
        <h2 className="mt-1 text-xl font-semibold text-[var(--color-navy-primary)]">Control {controlId}</h2>
      </div>
      <ControlDetailClient controlId={controlId} />
    </div>
  );
}
