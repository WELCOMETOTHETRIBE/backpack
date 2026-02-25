"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { WelcomeQuestionnaire } from "./WelcomeQuestionnaire";

export function SetupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();

  if (!open) return null;

  function handleSuccess() {
    onClose();
    router.refresh();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-white"
      role="dialog"
      aria-modal="true"
      aria-labelledby="setup-modal-title"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <h2 id="setup-modal-title" className="text-lg font-semibold text-[#0F172A]">
          Set up your organization
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
          <WelcomeQuestionnaire onSuccess={handleSuccess} />
        </div>
      </div>
    </div>
  );
}
