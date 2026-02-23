import { GovernanceWizard } from "@/components/governance-wizard/GovernanceWizard";
import Link from "next/link";

export default function GovernanceWizardPage() {
  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            href="/dashboard"
            className="text-[14px] font-medium text-slate-600 transition-colors hover:text-[#0F172A]"
          >
            ← Dashboard
          </Link>
          <h1 className="text-base font-semibold tracking-tight text-[#0F172A] sm:text-lg">
            Compliance hub
          </h1>
          <span className="w-16" aria-hidden />
        </div>
      </header>
      <GovernanceWizard />
    </div>
  );
}
