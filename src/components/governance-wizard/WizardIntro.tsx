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
    <div className="rounded-2xl border border-slate-200/80 bg-white p-8 shadow-[0_1px_3px_0_rgba(0,0,0,0.05)] sm:p-10">
      <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A]">Compliance hub</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
        Work through the 14 control families. Upload required documents and complete your SSP narrative for each control.
      </p>

      <div className="mt-10 flex flex-col items-center gap-5">
        <div className="relative h-28 w-28">
          <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
            <path
              className="text-slate-200"
              stroke="currentColor"
              strokeWidth="2.5"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className="text-[#0F172A]"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeDasharray={`${(familiesComplete / 14) * 100}, 100`}
              strokeLinecap="round"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-semibold text-[#0F172A]">{familiesComplete}/14</span>
          </div>
        </div>
        <p className="text-[14px] text-slate-500">Control families completed</p>
      </div>

      {FEATURE_INHERITED_CONTROLS && (
        <div className="mt-6 rounded-xl border border-amber-200/80 bg-amber-50/80 p-4">
          <p className="text-[14px] font-medium text-amber-800">Acknowledge Azure Government Inherited Controls</p>
          <p className="mt-1 text-[13px] text-amber-700">Placeholder — coming in production.</p>
        </div>
      )}

      <div className="mt-10 flex justify-end">
        <button
          type="button"
          onClick={onNext}
          className="rounded-xl bg-[#0F172A] px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-[#1e293b]"
        >
          Continue to controls
        </button>
      </div>
    </div>
  );
}
