"use client";

const FEATURE_INHERITED_CONTROLS = process.env.NEXT_PUBLIC_FEATURE_INHERITED_CONTROLS === "true";

type FamilyStat = { code: string; name: string; total: number; implemented: number };

export function WizardIntro({
  familiesComplete,
  familyStats,
  onNext,
}: {
  familiesComplete: number;
  familyStats: FamilyStat[];
  onNext: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold text-[#0F172A]">CMMC Governance Wizard</h1>
      <p className="mt-2 text-gray-600">
        Work through each of the 14 control families. Upload the required policy and procedure documents and write your SSP narrative for each governance-relevant control.
      </p>

      <div className="mt-8 flex flex-col items-center gap-6">
        <div className="relative h-32 w-32">
          <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
            <path
              className="text-gray-200"
              stroke="currentColor"
              strokeWidth="3"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className="text-[#0F172A]"
              stroke="currentColor"
              strokeWidth="3"
              strokeDasharray={`${(familiesComplete / 14) * 100}, 100`}
              strokeLinecap="round"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl font-bold text-[#0F172A]">{familiesComplete}/14</span>
          </div>
        </div>
        <p className="text-sm text-gray-600">Control families completed</p>
      </div>

      {FEATURE_INHERITED_CONTROLS && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">Acknowledge Azure Government Inherited Controls</p>
          <p className="mt-1 text-sm text-amber-700">Placeholder — coming in production.</p>
        </div>
      )}

      <div className="mt-8 flex justify-end">
        <button
          type="button"
          onClick={onNext}
          className="rounded-md bg-[#0F172A] px-4 py-2 text-sm font-medium text-white hover:bg-[#1e293b]"
        >
          Continue to controls
        </button>
      </div>
    </div>
  );
}
