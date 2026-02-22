import { GovernanceWizard } from "@/components/governance-wizard/GovernanceWizard";
import Link from "next/link";

export default function GovernanceWizardPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/dashboard" className="text-sm font-medium text-[#0F172A] hover:underline">
            ← Dashboard
          </Link>
          <h1 className="text-lg font-semibold text-[#0F172A]">CMMC Governance Wizard</h1>
          <span />
        </div>
      </div>
      <GovernanceWizard />
    </div>
  );
}
