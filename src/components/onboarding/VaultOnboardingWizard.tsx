"use client";

import { useState, useEffect, useCallback } from "react";
import { Phase0_TrustCodex } from "./phases/Phase0_TrustCodex";
import { Phase1_OrgProfile } from "./phases/Phase1_OrgProfile";
import { Phase2_CuiCategories } from "./phases/Phase2_CuiCategories";
import { Phase3_BoundaryConfirmation } from "./phases/Phase3_BoundaryConfirmation";
import { Phase4_AzureInheritance } from "./phases/Phase4_AzureInheritance";
import { Phase5_TrustCodexCoverage } from "./phases/Phase5_TrustCodexCoverage";
import { Phase6_CustomerControls } from "./phases/Phase6_CustomerControls";
import { Phase7_SprsReport } from "./phases/Phase7_SprsReport";
import { Phase8_SspGeneration } from "./phases/Phase8_SspGeneration";
import { Phase9_Complete } from "./phases/Phase9_Complete";

const PHASES = [
  { index: 0, label: "Trust Codex", shortLabel: "Codex" },
  { index: 1, label: "Org Profile", shortLabel: "Profile" },
  { index: 2, label: "CUI Categories", shortLabel: "CUI" },
  { index: 3, label: "Boundary", shortLabel: "Boundary" },
  { index: 4, label: "Azure Inheritance", shortLabel: "Azure" },
  { index: 5, label: "MacTech Coverage", shortLabel: "MacTech" },
  { index: 6, label: "Your Controls", shortLabel: "Controls" },
  { index: 7, label: "SPRS Report", shortLabel: "SPRS" },
  { index: 8, label: "SSP Generation", shortLabel: "SSP" },
  { index: 9, label: "Complete", shortLabel: "Done" },
];

export function VaultOnboardingWizard() {
  const [currentPhase, setCurrentPhase] = useState(0);
  const [completedPhases, setCompletedPhases] = useState<number[]>([]);
  const [phaseData, setPhaseData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);

  // On mount: restore state from server
  useEffect(() => {
    async function loadState() {
      try {
        const res = await fetch("/api/onboarding/state");
        if (res.ok) {
          const data = await res.json();
          if (data.phase !== undefined) setCurrentPhase(data.phase);
          if (data.completedPhases) setCompletedPhases(data.completedPhases);
          if (data.phaseData) setPhaseData(data.phaseData);
          // If wizard was already completed, redirect
          if (data.completedAt) {
            window.location.href = "/dashboard";
            return;
          }
        }
      } catch {
        // If load fails, start from beginning
      } finally {
        setLoading(false);
      }
    }
    loadState();
  }, []);

  const savePhase = useCallback(async (phase: number, data: Record<string, unknown>) => {
    setSaveError(null);
    try {
      const res = await fetch("/api/onboarding/save-phase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase, data }),
      });
      if (!res.ok) {
        const err = await res.json();
        setSaveError(err.error ?? "Failed to save progress");
      }
    } catch {
      setSaveError("Network error — progress may not have been saved");
    }
  }, []);

  async function handlePhaseComplete(phase: number, data: Record<string, unknown>) {
    // Persist phase data locally
    const newPhaseData = { ...phaseData, [String(phase)]: data };
    setPhaseData(newPhaseData);
    setCompletedPhases((prev) => [...new Set([...prev, phase])]);

    // Save to server
    await savePhase(phase, data);

    // Phase 9 completion: mark wizard done
    if (phase === 9) {
      try {
        await fetch("/api/onboarding/save-phase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase: 9, data: { ...data, completed: true } }),
        });
      } catch {
        // Non-fatal
      }
      window.location.href = "/dashboard";
      return;
    }

    setCurrentPhase(phase + 1);
  }

  // Phase 6 requires Phases 0–5 to be complete
  function canAccessPhase(phase: number): boolean {
    if (phase === 0) return true;
    if (phase === 6) {
      // Must complete phases 0–5 in order
      for (let i = 0; i < 6; i++) {
        if (!completedPhases.includes(i)) return false;
      }
      return true;
    }
    return completedPhases.includes(phase - 1) || phase <= currentPhase;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0D1117] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#8B5CF6] border-t-transparent animate-spin" />
          <p className="text-xs font-mono text-[#6B7280] uppercase tracking-wider">
            Loading onboarding state...
          </p>
        </div>
      </div>
    );
  }

  const progressPct = (completedPhases.length / PHASES.length) * 100;

  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      {/* Top bar */}
      <div className="border-b border-[#1E2D3D] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono font-bold text-[#8B5CF6] uppercase tracking-widest">
            MacTech
          </span>
          <span className="text-[#374151]">|</span>
          <span className="text-xs font-mono text-[#6B7280] uppercase tracking-wider">
            CUI Vault Onboarding
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-32 h-1 bg-[#1E2D3D]">
            <div
              className="h-1 bg-[#8B5CF6] transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-xs font-mono text-[#6B7280]">
            {completedPhases.length} / {PHASES.length}
          </span>
        </div>
      </div>

      <div className="flex">
        {/* Left phase nav — hidden on small screens */}
        <div className="hidden lg:flex flex-col w-52 border-r border-[#1E2D3D] min-h-[calc(100vh-49px)] p-4 gap-1 flex-shrink-0">
          {PHASES.map((phase) => {
            const isDone = completedPhases.includes(phase.index);
            const isCurrent = phase.index === currentPhase;
            const canAccess = canAccessPhase(phase.index);

            return (
              <button
                key={phase.index}
                type="button"
                disabled={!canAccess && !isDone}
                onClick={() => {
                  if (isDone || canAccess) setCurrentPhase(phase.index);
                }}
                className={`flex items-center gap-2.5 px-2.5 py-2 text-left transition-colors text-xs font-mono ${
                  isCurrent
                    ? "bg-[#8B5CF6]/10 text-white border border-[#8B5CF6]/30"
                    : isDone
                    ? "text-[#94A3B8] hover:text-white hover:bg-[#1E2D3D]/30 cursor-pointer"
                    : canAccess
                    ? "text-[#94A3B8] hover:text-white hover:bg-[#1E2D3D]/30 cursor-pointer"
                    : "text-[#374151] cursor-not-allowed"
                }`}
              >
                <span
                  className={`w-4 h-4 flex-shrink-0 flex items-center justify-center text-[10px] font-bold border ${
                    isCurrent
                      ? "border-[#8B5CF6] text-[#8B5CF6]"
                      : isDone
                      ? "border-[#10B981] text-[#10B981]"
                      : "border-[#374151] text-[#374151]"
                  }`}
                >
                  {isDone ? "✓" : phase.index}
                </span>
                <span>{phase.label}</span>
              </button>
            );
          })}
        </div>

        {/* Main content */}
        <div className="flex-1 p-6 lg:p-8 max-w-3xl mx-auto w-full">
          {/* Phase header */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-[#6B7280] uppercase tracking-widest">
                Phase {currentPhase + 1} of {PHASES.length}
              </span>
            </div>
            <h2 className="text-xl font-mono font-bold text-white">
              {PHASES[currentPhase]?.label}
            </h2>
          </div>

          {saveError && (
            <div className="mb-4 border border-[#F59E0B]/50 bg-[#F59E0B]/10 text-[#F59E0B] text-xs font-mono px-3 py-2">
              Warning: {saveError}. Your progress may not have been saved — please try again.
            </div>
          )}

          {/* Phase content */}
          {currentPhase === 0 && (
            <Phase0_TrustCodex
              onComplete={(data) => handlePhaseComplete(0, data)}
            />
          )}
          {currentPhase === 1 && (
            <Phase1_OrgProfile
              initialData={phaseData["1"] as Record<string, unknown> | undefined}
              onComplete={(data) => handlePhaseComplete(1, data)}
            />
          )}
          {currentPhase === 2 && (
            <Phase2_CuiCategories
              initialData={phaseData["2"] as Record<string, unknown> | undefined}
              onComplete={(data) => handlePhaseComplete(2, data)}
            />
          )}
          {currentPhase === 3 && (
            <Phase3_BoundaryConfirmation
              onComplete={(data) => handlePhaseComplete(3, data)}
            />
          )}
          {currentPhase === 4 && (
            <Phase4_AzureInheritance
              onComplete={(data) => handlePhaseComplete(4, data)}
            />
          )}
          {currentPhase === 5 && (
            <Phase5_TrustCodexCoverage
              onComplete={(data) => handlePhaseComplete(5, data)}
            />
          )}
          {currentPhase === 6 && (
            <Phase6_CustomerControls
              onComplete={(data) => handlePhaseComplete(6, data)}
            />
          )}
          {currentPhase === 7 && (
            <Phase7_SprsReport
              phaseData={phaseData}
              onComplete={(data) => handlePhaseComplete(7, data)}
            />
          )}
          {currentPhase === 8 && (
            <Phase8_SspGeneration
              phaseData={phaseData}
              onComplete={(data) => handlePhaseComplete(8, data)}
            />
          )}
          {currentPhase === 9 && (
            <Phase9_Complete
              phaseData={phaseData}
              onComplete={(data) => handlePhaseComplete(9, data)}
            />
          )}

          {/* Mobile phase indicator */}
          <div className="lg:hidden mt-8 flex items-center gap-1 justify-center">
            {PHASES.map((phase) => (
              <div
                key={phase.index}
                className={`h-1 transition-all duration-300 ${
                  completedPhases.includes(phase.index)
                    ? "w-4 bg-[#10B981]"
                    : phase.index === currentPhase
                    ? "w-4 bg-[#8B5CF6]"
                    : "w-2 bg-[#1E2D3D]"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
