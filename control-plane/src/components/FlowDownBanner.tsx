import Link from "next/link";
import { AlertCircle } from "lucide-react";

interface FlowDownBannerProps {
  primeCount: number;
}

export default function FlowDownBanner({ primeCount }: FlowDownBannerProps) {
  if (primeCount === 0) return null;

  return (
    <div className="mb-6 rounded-lg border border-[#3B82F6] bg-[#3B82F6]/10 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-[#3B82F6] mt-0.5" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-[#0F172A]">
            Active Flow-Down Requirements
          </h3>
          <p className="mt-1 text-sm text-gray-700">
            You have active flow-down requirements from {primeCount} prime contractor{primeCount > 1 ? "s" : ""}.
            These controls must be implemented to maintain compliance with your contracts.
          </p>
          <Link
            href="/dashboard/supply-chain/flowdowns"
            className="mt-2 inline-block text-sm font-medium text-[#3B82F6] hover:text-[#2563EB]"
          >
            View flow-down requirements →
          </Link>
        </div>
      </div>
    </div>
  );
}
