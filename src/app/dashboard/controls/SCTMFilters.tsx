"use client";

import { CONTROL_FAMILIES } from "@/components/governance-wizard/constants";

const ADJUDICATED = ["implemented", "assessed", "inherited", "not_applicable"];

export type SCTMRecord = {
  id: string;
  controlId: string;
  implementationStatus: string;
  governanceNarrative: string | null;
  responsibleRoleId: string | null;
  roleName: string | null;
  artifactCount: number;
};

export function SCTMFilters({
  records,
  family,
  type,
  onFamilyChange,
  onTypeChange,
  hideFamilyList = false,
}: {
  records: SCTMRecord[];
  family: string | null;
  type: "all" | "configuration" | "governance";
  onFamilyChange: (code: string | null) => void;
  onTypeChange: (t: "all" | "configuration" | "governance") => void;
  /** When true, family filter is shown in the top bar instead of sidebar. */
  hideFamilyList?: boolean;
}) {
  const adjudicated = records.filter((r) => ADJUDICATED.includes(r.implementationStatus)).length;
  const outstanding = records.length - adjudicated;

  const familyStats = CONTROL_FAMILIES.map((f) => {
    const inFamily = records.filter((r) => r.controlId.startsWith(f.controlPrefix));
    const adj = inFamily.filter((r) => ADJUDICATED.includes(r.implementationStatus)).length;
    return { code: f.code, name: f.plainName, total: inFamily.length, adjudicated: adj };
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
          Type
        </p>
        <div className="mt-2 flex flex-col gap-1">
          {(["all", "configuration", "governance"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTypeChange(t)}
              className={`rounded-[var(--radius-md)] px-3 py-2 text-left text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2 ${
                type === t
                  ? "bg-[var(--color-blue-accent)] text-white"
                  : "text-[var(--color-gray-700)] hover:bg-[var(--color-gray-100)]"
              }`}
            >
              {t === "all" ? "All" : t === "configuration" ? "Configuration" : "Governance"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
          Status
        </p>
        <p className="mt-2 text-sm text-[var(--color-gray-700)]">
          Adjudicated <span className="font-semibold">{adjudicated}</span>
        </p>
        <p className="text-sm text-[var(--color-gray-700)]">
          Outstanding <span className="font-semibold">{outstanding}</span>
        </p>
      </div>

      {!hideFamilyList && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
            Family
          </p>
          <ul className="mt-2 space-y-0.5" role="list">
            {familyStats.map((f) => (
              <li key={f.code}>
                <button
                  type="button"
                  onClick={() => onFamilyChange(family === f.code ? null : f.code)}
                  className={`w-full rounded-[var(--radius-md)] px-3 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2 ${
                    family === f.code
                      ? "bg-[var(--color-primary)] font-medium text-white"
                      : "text-[var(--color-gray-700)] hover:bg-[var(--color-gray-100)]"
                  }`}
                >
                  {f.code} — {f.name} ({f.adjudicated}/{f.total})
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
