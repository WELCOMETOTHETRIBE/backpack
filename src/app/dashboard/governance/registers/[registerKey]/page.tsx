import Link from "next/link";
import RegisterDetailClient from "./RegisterDetailClient";

export default async function GovernanceRegisterDetailPage({
  params,
}: {
  params: Promise<{ registerKey: string }>;
}) {
  const { registerKey } = await params;
  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/governance/registers" className="text-sm text-[var(--color-gray-600)] hover:underline">
          ← Registers
        </Link>
        <h2 className="mt-1 text-xl font-semibold text-[var(--color-navy-primary)]">Register: {decodeURIComponent(registerKey)}</h2>
      </div>
      <RegisterDetailClient registerKey={decodeURIComponent(registerKey)} />
    </div>
  );
}
