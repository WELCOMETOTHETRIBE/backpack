"use client";

import type { ControlRecord, NistControl, Role } from "./GovernanceWizard";
import { CONTROL_FAMILIES } from "./constants";
import { ControlCard } from "./ControlCard";

export function WizardGauntlet({
  records,
  nistControls,
  roles,
  selectedFamily,
  onSelectFamily,
  onRefresh,
  onReview,
}: {
  records: ControlRecord[];
  nistControls: NistControl[];
  roles: Role[];
  selectedFamily: string;
  onSelectFamily: (code: string) => void;
  onRefresh: () => void;
  onReview: () => void;
}) {
  const family = CONTROL_FAMILIES.find((f) => f.code === selectedFamily);
  const prefix = family?.controlPrefix ?? "3.1";
  const familyRecords = records
    .filter((r) => r.controlId.startsWith(prefix))
    .sort((a, b) => a.controlId.localeCompare(b.controlId));
  const nistByControlId = Object.fromEntries(nistControls.map((n) => [n.controlId, n]));

  return (
    <div className="flex gap-6">
      <aside className="w-56 shrink-0 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-[#0F172A]">Control families</h2>
        <nav className="mt-2 space-y-1">
          {CONTROL_FAMILIES.map((f) => {
            const inFamily = records.filter((r) => r.controlId.startsWith(f.controlPrefix));
            const implemented = inFamily.filter(
              (r) => r.implementationStatus === "implemented" || r.implementationStatus === "assessed" || r.implementationStatus === "inherited"
            ).length;
            const pct = inFamily.length ? Math.round((implemented / inFamily.length) * 100) : 0;
            return (
              <button
                key={f.code}
                type="button"
                onClick={() => onSelectFamily(f.code)}
                className={`block w-full rounded px-2 py-1.5 text-left text-sm ${
                  selectedFamily === f.code ? "bg-[#0F172A] text-white" : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <span className="font-medium">{f.code}</span>
                <span className="ml-1 text-xs opacity-80">({pct}%)</span>
              </button>
            );
          })}
        </nav>
        <div className="mt-6">
          <button
            type="button"
            onClick={onReview}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Review & finalize
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 space-y-6">
        <h1 className="text-xl font-bold text-[#0F172A]">{family?.name ?? selectedFamily}</h1>
        <div className="space-y-6">
          {familyRecords.map((record) => (
            <ControlCard
              key={record.id}
              record={record}
              nist={nistByControlId[record.controlId]}
              roles={roles}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
