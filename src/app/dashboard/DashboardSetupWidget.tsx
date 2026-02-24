"use client";

import { useState } from "react";
import { Settings2, ChevronRight } from "lucide-react";
import { SetupModal } from "@/components/welcome/SetupModal";

export function DashboardSetupWidget({
  onboardingStarted,
}: {
  onboardingStarted: boolean;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[15px] text-slate-600">
            {onboardingStarted ? "Welcome back." : "Welcome. Complete setup when you’re ready to tailor your CMMC journey."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-[14px] font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
        >
          <Settings2 className="h-4 w-4" />
          {onboardingStarted ? "Edit setup" : "Complete setup"}
        </button>
      </div>

      {!onboardingStarted && (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="mb-6 flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50/80 sm:p-6"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0F172A]/10">
              <Settings2 className="h-5 w-5 text-[#0F172A]" />
            </div>
            <div>
              <h3 className="font-semibold text-[#0F172A]">Set up your organization</h3>
              <p className="mt-0.5 text-sm text-slate-600">
                A few details help us tailor your CMMC compliance journey. You can do this anytime.
              </p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
        </button>
      )}

      <SetupModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
