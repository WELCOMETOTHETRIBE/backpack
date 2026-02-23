"use client";

import { useRef, useEffect, useState } from "react";
import type { ControlRecord, NistControl, Role } from "./GovernanceWizard";
import { CONTROL_FAMILIES } from "./constants";
import { ControlCardV2 } from "./ControlCardV2";

export function WizardGauntlet({
  records,
  nistControls,
  roles,
  selectedFamily,
  onSelectFamily,
  onRefresh,
  onReview,
  onCompleteSetup,
}: {
  records: ControlRecord[];
  nistControls: NistControl[];
  roles: Role[];
  selectedFamily: string;
  onSelectFamily: (code: string) => void;
  onRefresh: () => void;
  onReview: () => void;
  onCompleteSetup?: () => void;
}) {
  const mainRef = useRef<HTMLDivElement>(null);
  const firstIncompleteRef = useRef<HTMLDivElement>(null);
  const [sprsScore, setSprsScore] = useState<number | null>(null);

  const family = CONTROL_FAMILIES.find((f) => f.code === selectedFamily);
  const prefix = family?.controlPrefix ?? "3.1";
  const familyRecords = records
    .filter((r) => r.controlId.startsWith(prefix))
    .sort((a, b) => a.controlId.localeCompare(b.controlId));
  const nistByControlId = Object.fromEntries(nistControls.map((n) => [n.controlId, n]));

  const completedCount = records.filter(
    (r) =>
      r.implementationStatus === "implemented" ||
      r.implementationStatus === "assessed" ||
      r.implementationStatus === "inherited"
  ).length;
  const firstIncompleteIndex = familyRecords.findIndex(
    (r) =>
      r.implementationStatus !== "implemented" &&
      r.implementationStatus !== "assessed" &&
      r.implementationStatus !== "inherited"
  );

  useEffect(() => {
    fetch("/api/readiness/sprs-score")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setSprsScore(data?.score ?? null));
  }, [records]);

  function jumpToIncomplete() {
    firstIncompleteRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="flex gap-6">
      <aside className="w-64 shrink-0 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-[#0F172A]">Control families</h2>
        <button
          type="button"
          onClick={jumpToIncomplete}
          disabled={firstIncompleteIndex < 0}
          className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          aria-label="Jump to first incomplete control"
        >
          Jump to incomplete
        </button>
        <nav className="mt-4 space-y-1" aria-label="Control families">
          {CONTROL_FAMILIES.map((f) => {
            const inFamily = records.filter((r) => r.controlId.startsWith(f.controlPrefix));
            const implemented = inFamily.filter(
              (r) =>
                r.implementationStatus === "implemented" ||
                r.implementationStatus === "assessed" ||
                r.implementationStatus === "inherited"
            ).length;
            const pct = inFamily.length ? Math.round((implemented / inFamily.length) * 100) : 0;
            const Icon = f.icon;
            return (
              <button
                key={f.code}
                type="button"
                onClick={() => onSelectFamily(f.code)}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-all duration-200 ${
                  selectedFamily === f.code ? "bg-[#0F172A] text-white" : "text-gray-700 hover:bg-gray-100"
                }`}
                aria-label={`${f.plainName}, ${pct}% complete`}
              >
                <span className="relative h-8 w-8 shrink-0" aria-hidden>
                  <svg className="h-8 w-8 -rotate-90" viewBox="0 0 36 36">
                    <path
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      className={selectedFamily === f.code ? "text-white/30" : "text-gray-200"}
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      className={selectedFamily === f.code ? "text-white" : "text-blue-600"}
                      strokeDasharray={`${pct}, 100`}
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{f.plainName}</span>
                <span className={`shrink-0 text-xs ${selectedFamily === f.code ? "text-white/90" : "text-gray-500"}`}>
                  {pct}%
                </span>
              </button>
            );
          })}
        </nav>
        <div className="mt-6 space-y-2">
          <button
            type="button"
            onClick={onReview}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Review & finalize
          </button>
          {onCompleteSetup && (
            <button
              type="button"
              onClick={onCompleteSetup}
              className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              aria-label="Complete Setup"
            >
              Complete Setup
            </button>
          )}
        </div>
      </aside>

      <main ref={mainRef} className="min-w-0 flex-1 space-y-6">
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <p className="text-sm font-medium text-gray-700">
            You&apos;ve completed <span className="font-semibold text-gray-900">{completedCount}</span> of 110
            controls.
            {sprsScore !== null && (
              <> Your current SPRS score is <span className="font-semibold text-gray-900">{sprsScore}</span>.</>
            )}
          </p>
        </div>
        <h1 className="text-xl font-bold text-[#0F172A]">{family?.plainName ?? family?.name ?? selectedFamily}</h1>
        <div className="space-y-6">
          {familyRecords.map((record, index) => (
            <div
              key={record.id}
              ref={index === firstIncompleteIndex ? firstIncompleteRef : undefined}
            >
              <ControlCardV2
                record={record}
                nist={nistByControlId[record.controlId]}
                roles={roles}
                onRefresh={onRefresh}
              />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
