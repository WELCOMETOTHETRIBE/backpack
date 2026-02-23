"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

/**
 * Step 6: Full-screen success overlay after user clicks "Complete Setup" in the compliance wizard.
 * Shows confetti/checkmark, SPRS score, and "Go to my Dashboard".
 */
export function OnboardingCompleteOverlay({
  sprsScore,
  onClose,
}: {
  sprsScore: number | null;
  onClose: () => void;
}) {
  const router = useRouter();

  function goToDashboard() {
    onClose();
    router.push("/dashboard");
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-labelledby="complete-overlay-title"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600" aria-hidden>
          <CheckCircle2 className="h-10 w-10" />
        </div>
        <h2 id="complete-overlay-title" className="text-xl font-bold text-gray-900">
          Setup complete
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Your compliance program is ready. You can continue working through controls from your dashboard.
        </p>
        {sprsScore !== null && (
          <p className="mt-4 text-2xl font-semibold text-gray-900">
            Your current SPRS score: <span className="text-blue-600">{sprsScore}</span>
          </p>
        )}
        <button
          type="button"
          onClick={goToDashboard}
          className="mt-8 w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-all duration-200"
          aria-label="Go to my Dashboard"
        >
          Go to my Dashboard
        </button>
      </div>
    </div>
  );
}
