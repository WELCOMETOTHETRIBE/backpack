"use client";

import { useState, useMemo } from "react";
import { VAULT_CONTROL_MAP, type VaultControl } from "@/data/vault-control-map";

interface Phase5Props {
  onComplete: (data: Record<string, unknown>) => void;
}

// Build family groups for the shared controls that MacTech provides
function buildFamilyGroups() {
  const sharedWithMactech = VAULT_CONTROL_MAP.filter(
    (c) =>
      c.tier === "shared" &&
      c.mactechProvides &&
      c.mactechProvides.length > 0
  );

  const families: Record<string, VaultControl[]> = {};
  for (const ctrl of sharedWithMactech) {
    if (!families[ctrl.family]) families[ctrl.family] = [];
    families[ctrl.family].push(ctrl);
  }
  return families;
}

export function Phase5_TrustCodexCoverage({ onComplete }: Phase5Props) {
  const familyGroups = useMemo(() => buildFamilyGroups(), []);
  const familyKeys = Object.keys(familyGroups).sort();
  const [acceptedFamilies, setAcceptedFamilies] = useState<Set<string>>(new Set());
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(
    new Set([familyKeys[0]]) // open first family by default
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalFamilies = familyKeys.length;
  const acceptedCount = acceptedFamilies.size;
  const allAccepted = acceptedCount === totalFamilies;

  function toggleFamily(family: string) {
    setExpandedFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(family)) next.delete(family);
      else next.add(family);
      return next;
    });
  }

  function acceptFamily(family: string) {
    setAcceptedFamilies((prev) => new Set([...prev, family]));
  }

  function acceptAll() {
    setAcceptedFamilies(new Set(familyKeys));
  }

  async function handleSubmit() {
    if (!allAccepted) return;
    setSubmitting(true);
    setError(null);

    try {
      // Write "mactech_portion_accepted" for all shared controls
      // These are NOT fully "implemented" yet — customer must attest their portion in Phase 6
      const adjudications = Object.values(familyGroups)
        .flat()
        .map((ctrl) => ({
          controlId: ctrl.controlId,
          tier: ctrl.tier,
          status: "mactech_portion_accepted",
          narrative: `MacTech Trust Codex provides: ${ctrl.mactechProvides?.join("; ") ?? ""}. ` +
            (ctrl.governanceDocIds?.length
              ? `Governance documents: ${ctrl.governanceDocIds.join(", ")}.`
              : ""),
          needsReview: ctrl.needsReview ?? false,
          needsReviewReason: ctrl.needsReviewReason,
        }));

      const res = await fetch("/api/onboarding/adjudicate-controls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adjudications }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to record Trust Codex coverage");
      }

      onComplete({
        trustCodexCoverageAccepted: true,
        acceptedFamilies: [...acceptedFamilies],
        controlsMarked: adjudications.length,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border-l-4 border-[#8B5CF6] pl-4">
        <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
          MacTech Trust Codex Coverage Review
        </h3>
        <p className="text-xs text-[#94A3B8] mt-1">
          Review what MacTech provides for each control family. Accepting a family
          acknowledges the MacTech platform contribution. You will still attest your
          organization's portion in the next phase.
        </p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1 bg-[#1E2D3D]">
          <div
            className="h-1 bg-[#8B5CF6] transition-all duration-300"
            style={{ width: `${(acceptedCount / totalFamilies) * 100}%` }}
          />
        </div>
        <span className="text-xs font-mono text-[#94A3B8]">
          {acceptedCount} / {totalFamilies} families accepted
        </span>
        {!allAccepted && (
          <button
            type="button"
            onClick={acceptAll}
            className="text-xs font-mono text-[#8B5CF6] hover:text-[#A78BFA] uppercase tracking-wide border border-[#8B5CF6]/30 px-2 py-1"
          >
            Accept All
          </button>
        )}
      </div>

      {/* Family accordions */}
      <div className="flex flex-col gap-2">
        {familyKeys.map((family) => {
          const controls = familyGroups[family];
          const isExpanded = expandedFamilies.has(family);
          const isAccepted = acceptedFamilies.has(family);
          const familyName = controls[0]?.familyName ?? family;

          return (
            <div
              key={family}
              className={`border transition-colors ${
                isAccepted ? "border-[#8B5CF6]/50" : "border-[#1E2D3D]"
              }`}
            >
              {/* Family header */}
              <div
                className={`flex items-center justify-between p-3 cursor-pointer hover:bg-[#1E2D3D]/30 ${
                  isAccepted ? "bg-[#8B5CF6]/5" : ""
                }`}
                onClick={() => toggleFamily(family)}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs font-mono font-bold px-2 py-0.5 ${
                      isAccepted
                        ? "bg-[#8B5CF6] text-white"
                        : "bg-[#1E2D3D] text-[#94A3B8]"
                    }`}
                  >
                    {family}
                  </span>
                  <span className="text-sm font-mono text-white">{familyName}</span>
                  <span className="text-xs text-[#6B7280]">
                    ({controls.length} controls)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {isAccepted && (
                    <span className="text-xs font-mono text-[#8B5CF6]">✓ ACCEPTED</span>
                  )}
                  <span className="text-[#6B7280] font-mono text-xs">
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </div>
              </div>

              {/* Family content */}
              {isExpanded && (
                <div className="border-t border-[#1E2D3D] p-4 flex flex-col gap-4">
                  {controls.map((ctrl) => (
                    <div key={ctrl.controlId} className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-[#8B5CF6] font-bold">
                          {ctrl.controlId}
                        </span>
                        <span className="text-sm text-white font-mono">{ctrl.title}</span>
                        <span className="text-xs text-[#F59E0B] font-mono ml-auto flex-shrink-0">
                          {ctrl.sprsWeight}pt
                        </span>
                      </div>
                      {/* MacTech provides */}
                      <div className="ml-4 flex flex-col gap-1">
                        {ctrl.mactechProvides?.map((item, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className="text-[#8B5CF6] text-xs mt-0.5">▸</span>
                            <span className="text-xs text-[#94A3B8]">{item}</span>
                          </div>
                        ))}
                      </div>
                      {/* Governance docs */}
                      {ctrl.governanceDocIds && ctrl.governanceDocIds.length > 0 && (
                        <div className="ml-4 flex flex-wrap gap-1">
                          {ctrl.governanceDocIds.map((doc) => (
                            <span
                              key={doc}
                              className="text-xs font-mono text-[#6B7280] border border-[#1E2D3D] px-1.5 py-0.5"
                            >
                              {doc}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Technical coverage badge */}
                      {ctrl.technicalCoverage && ctrl.technicalCoverage !== "GOVERNANCE_ONLY" && ctrl.technicalCoverage !== "NONE" && (
                        <div className="ml-4">
                          <span
                            className={`text-xs font-mono px-2 py-0.5 border ${
                              ctrl.technicalCoverage === "STRONG"
                                ? "text-[#10B981] border-[#10B981]/30 bg-[#10B981]/5"
                                : "text-[#F59E0B] border-[#F59E0B]/30 bg-[#F59E0B]/5"
                            }`}
                          >
                            COLLECTOR: {ctrl.technicalCoverage}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Accept family button */}
                  {!isAccepted && (
                    <button
                      type="button"
                      onClick={() => acceptFamily(family)}
                      className="mt-2 px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider border border-[#8B5CF6] text-[#8B5CF6] hover:bg-[#8B5CF6] hover:text-white transition-colors"
                    >
                      ACCEPT {family} COVERAGE ({controls.length} CONTROLS)
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="border border-[#EF4444] bg-[#7F1D1D]/20 text-[#EF4444] text-sm font-mono px-3 py-2">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!allAccepted || submitting}
        className={`w-full py-3 text-sm font-mono font-bold uppercase tracking-widest transition-colors ${
          allAccepted && !submitting
            ? "bg-[#8B5CF6] text-white hover:bg-[#A78BFA] cursor-pointer"
            : "bg-[#1E2D3D] text-[#4B5563] cursor-not-allowed"
        }`}
      >
        {submitting
          ? "RECORDING TRUST CODEX COVERAGE..."
          : "ACCEPT ALL COVERAGE & CONTINUE TO YOUR CONTROLS"}
      </button>
    </div>
  );
}
