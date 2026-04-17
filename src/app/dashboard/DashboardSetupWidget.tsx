"use client";

import { useState } from "react";
import { Settings2, ChevronRight, CheckCircle2, Circle, ArrowRight } from "lucide-react";
import { SetupModal } from "@/components/welcome/SetupModal";
import Link from "next/link";

interface ChecklistItem {
  label: string;
  description: string;
  done: boolean;
  href: string;
}

export function DashboardSetupWidget({
  onboardingStarted,
  checklist,
}: {
  onboardingStarted: boolean;
  checklist?: ChecklistItem[];
}) {
  const [modalOpen, setModalOpen] = useState(false);

  const completedCount = checklist?.filter((c) => c.done).length ?? 0;
  const totalCount = checklist?.length ?? 0;
  const allDone = completedCount === totalCount && totalCount > 0;

  return (
    <>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[15px] text-slate-600">
            {onboardingStarted
              ? allDone
                ? "All setup steps complete. Your CMMC compliance posture is active."
                : `Welcome back. ${totalCount - completedCount} step${totalCount - completedCount === 1 ? "" : "s"} remaining to complete your CMMC setup.`
              : "Welcome. Complete setup when you're ready to tailor your CMMC journey."}
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

      {/* CMMC Journey Checklist — shown after onboarding starts */}
      {onboardingStarted && checklist && !allDone && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-800">CMMC Certification Checklist</h3>
            <span className="text-xs font-medium text-slate-500">
              {completedCount} / {totalCount} complete
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100 mb-4">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${totalCount ? (completedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
          <div className="space-y-2">
            {checklist.map((item, i) => (
              <Link
                key={i}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  item.done
                    ? "bg-emerald-50/50"
                    : "bg-slate-50 hover:bg-slate-100"
                }`}
              >
                {item.done ? (
                  <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-emerald-500" />
                ) : (
                  <Circle className="h-4.5 w-4.5 shrink-0 text-slate-300" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${item.done ? "text-slate-500 line-through" : "text-slate-800"}`}>
                    {item.label}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
                </div>
                {!item.done && <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />}
              </Link>
            ))}
          </div>
        </div>
      )}

      <SetupModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
