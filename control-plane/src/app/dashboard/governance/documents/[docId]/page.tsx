import Link from "next/link";
import DocumentDetailClient from "./DocumentDetailClient";

export default async function GovernanceDocumentDetailPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  const { docId } = await params;
  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/governance/documents" className="text-sm text-[var(--color-gray-600)] hover:underline">
          ← Document control
        </Link>
        <h2 className="mt-1 text-xl font-semibold text-[var(--color-navy-primary)]">Document</h2>
      </div>
      <DocumentDetailClient docId={docId} />
    </div>
  );
}
