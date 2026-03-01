import Link from "next/link";
import ControlDetailClient from "@/app/dashboard/governance/controls/[controlId]/ControlDetailClient";

export default async function TechnicalControlDetailPage({
  params,
}: {
  params: Promise<{ controlId: string }>;
}) {
  const { controlId } = await params;
  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/technical/controls" className="text-sm text-[var(--color-gray-600)] hover:underline">
          ← Technical controls
        </Link>
        <h2 className="mt-1 text-xl font-semibold text-[var(--color-navy-primary)]">Control {controlId}</h2>
      </div>
      <ControlDetailClient controlId={controlId} />
    </div>
  );
}
