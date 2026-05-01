"use client";

import { useState, useEffect, useCallback } from "react";
import { Phase0_TrustCodex } from "./phases/Phase0_TrustCodex";
import { Phase1_OrgProfile } from "./phases/Phase1_OrgProfile";
import { Phase2_CuiCategories } from "./phases/Phase2_CuiCategories";
import { Phase3_BoundaryConfirmation } from "./phases/Phase3_BoundaryConfirmation";
import { Phase4_AzureInheritance } from "./phases/Phase4_AzureInheritance";
// Phase5 (MacTech Coverage) and Phase6 (Your Controls) intentionally removed
// from onboarding. Per-control adjudication now lives in the Codex
// (/dashboard/controls) so onboarding stays a thin signup-and-acknowledge flow.

// Onboarding is the boundary-definition + agreement step. SPRS reporting, SSP
// generation, and other deliverables live in the dashboard as post-onboarding
// work (training, IR tabletop, governance sign-off, evidence collection).
const PHASES = [
  { index: 0, label: "Trust Codex", shortLabel: "Codex" },
  { index: 1, label: "Org Profile", shortLabel: "Profile" },
  { index: 2, label: "CUI Categories", shortLabel: "CUI" },
  { index: 3, label: "Boundary", shortLabel: "Boundary" },
  { index: 4, label: "Azure Inheritance", shortLabel: "Azure" },
];

const LAST_PHASE_INDEX = PHASES.length - 1; // 4

/**
 * Map the wizard's accumulated phaseData into the body shape expected by
 * POST /api/onboarding/complete. All fields on the endpoint are optional, so
 * we pass through what we have and let the server fill in the rest.
 */
/**
 * Surface Zod-level validation details from an API error response into a
 * human-readable string. The wizard's API routes wrap their bodies in a
 * standard { error, details } shape; details is the array of Zod issues
 * (path + message). Without surfacing that, customers see only "Invalid
 * request" and have no way to know which field is wrong.
 */
function formatApiError(err: unknown, fallback: string): string {
  if (!err || typeof err !== "object") return fallback;
  const e = err as { error?: unknown; details?: unknown };
  const baseMsg = typeof e.error === "string" ? e.error : fallback;
  if (Array.isArray(e.details) && e.details.length > 0) {
    const issues = e.details
      .map((issue: unknown) => {
        if (!issue || typeof issue !== "object") return null;
        const i = issue as { path?: unknown; message?: unknown };
        const path = Array.isArray(i.path) ? i.path.join(".") : "";
        const msg = typeof i.message === "string" ? i.message : "";
        if (!msg) return null;
        return path ? `${path}: ${msg}` : msg;
      })
      .filter((s): s is string => !!s)
      .slice(0, 3);
    if (issues.length > 0) {
      return `${baseMsg} — ${issues.join("; ")}`;
    }
  }
  return baseMsg;
}

function mapPhaseDataToCompleteBody(
  phaseData: Record<string, unknown>
): Record<string, unknown> {
  const get = <T,>(p: number, k: string): T | undefined => {
    const phase = phaseData[String(p)] as Record<string, unknown> | undefined;
    return phase?.[k] as T | undefined;
  };
  const phase0 = (phaseData["0"] ?? {}) as Record<string, unknown>;
  const phase1 = (phaseData["1"] ?? {}) as Record<string, unknown>;
  const owner = (phase1.systemOwner ?? {}) as Record<string, unknown>;

  return {
    name: phase1.orgName,
    cageCode: phase0.cageCode,
    primaryAddress: phase1.address,
    primaryContactName: owner.name,
    primaryContactEmail: owner.email,
    cmmcTargetLevel: "L2",
    cuiBoundary: phase1.systemDescription ?? get(2, "narrative"),
    systemScope: phase1.systemDescription,
    selectedTechnologies: get<string[]>(3, "scopeComponents"),
  };
}

export function VaultOnboardingWizard({
  allowBypass = false,
}: {
  allowBypass?: boolean;
} = {}) {
  const [currentPhase, setCurrentPhase] = useState(0);
  const [completedPhases, setCompletedPhases] = useState<number[]>([]);
  const [phaseData, setPhaseData] = useState<Record<string, unknown>>({});
  const [seed, setSeed] = useState<{
    orgName: string;
    cageCode: string;
    ownerName: string;
    ownerEmail: string;
  }>({ orgName: "", cageCode: "", ownerName: "", ownerEmail: "" });
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [bypassing, setBypassing] = useState(false);
  const [bypassError, setBypassError] = useState<string | null>(null);

  async function handleBypass() {
    if (!confirm("Skip the Vault onboarding wizard and jump to the dashboard?\n\nThis is an admin-only shortcut for testing. Onboarding data will be marked complete without collecting any answers.")) {
      return;
    }
    setBypassing(true);
    setBypassError(null);
    try {
      const res = await fetch("/api/onboarding/bypass", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? "Bypass failed");
      }
      window.location.href = "/dashboard";
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setBypassError(msg);
      setBypassing(false);
    }
  }

  // On mount: restore state from server
  useEffect(() => {
    async function loadState() {
      try {
        const res = await fetch("/api/onboarding/state");
        if (res.ok) {
          const data = await res.json();
          if (data.completedPhases) setCompletedPhases(data.completedPhases);
          if (data.phaseData) setPhaseData(data.phaseData);
          if (data.seed) setSeed(data.seed);
          // If wizard was already completed, allow reviewing (Edit setup)
          if (data.completedAt) {
            setIsEditMode(true);
            // Show Phase 1 (Org Profile) for review — all phases accessible via nav
            setCurrentPhase(1);
            setCompletedPhases(Array.from({ length: PHASES.length }, (_, i) => i));
          } else if (data.phase !== undefined) {
            // Clamp to current phase range — older sessions may have a phase
            // index pointing at since-removed wizard steps (5/6).
            setCurrentPhase(Math.min(data.phase, LAST_PHASE_INDEX));
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

  const savePhase = useCallback(
    async (phase: number, data: Record<string, unknown>, complete = false) => {
      setSaveError(null);
      try {
        const res = await fetch("/api/onboarding/save-phase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase, data, complete }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setSaveError(formatApiError(err, "Failed to save progress"));
        }
      } catch {
        setSaveError("Network error — progress may not have been saved");
      }
    },
    []
  );

  async function handlePhaseComplete(phase: number, data: Record<string, unknown>) {
    // Persist phase data locally
    const newPhaseData = { ...phaseData, [String(phase)]: data };
    setPhaseData(newPhaseData);
    setCompletedPhases((prev) => [...new Set([...prev, phase])]);

    const isLast = phase === LAST_PHASE_INDEX;

    // Save to server — set complete=true on the final phase so the server
    // stamps onboarding_wizard_state.completed_at.
    await savePhase(phase, data, isLast);

    if (isLast) {
      // Trigger the full onboarding-complete pipeline: seeds the MacTech
      // Vault boundary, the 24 governance registers, the 110 control records,
      // auto-generates client-required POAMs, and creates placeholder
      // artifacts. Without this call the dashboard would be empty.
      try {
        const completeBody = mapPhaseDataToCompleteBody(newPhaseData);
        const res = await fetch("/api/onboarding/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(completeBody),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setSaveError(
            formatApiError(
              err,
              "Onboarding completed but post-setup seeding failed. Please contact support."
            )
          );
          return;
        }
      } catch {
        setSaveError("Network error during final setup. Please try again.");
        return;
      }
      window.location.href = "/dashboard";
      return;
    }

    setCurrentPhase(phase + 1);
  }

  function canAccessPhase(phase: number): boolean {
    if (phase === 0) return true;
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
          {isEditMode && (
            <a
              href="/dashboard"
              className="text-xs font-mono text-[#8B5CF6] hover:text-[#A78BFA] transition-colors mr-2"
            >
              ← Dashboard
            </a>
          )}
          {allowBypass && !isEditMode && (
            <button
              type="button"
              onClick={handleBypass}
              disabled={bypassing}
              className="text-xs font-mono font-bold text-[#F59E0B] hover:text-[#FBBF24] transition-colors border border-[#F59E0B]/40 hover:border-[#F59E0B] px-3 py-1.5 rounded disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider"
              title="Admin shortcut: mark onboarding complete and go directly to the dashboard"
            >
              {bypassing ? "Bypassing…" : "⚡ Bypass"}
            </button>
          )}
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

      {bypassError && (
        <div className="border-b border-[#EF4444]/50 bg-[#EF4444]/10 text-[#F87171] text-xs font-mono px-6 py-2">
          Bypass failed: {bypassError}
        </div>
      )}

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
              seed={seed}
              onComplete={(data) => handlePhaseComplete(1, data)}
            />
          )}
          {currentPhase === 2 && (
            <Phase2_CuiCategories
              initialData={phaseData["2"] as Record<string, unknown> | undefined}
              orgName={seed.orgName}
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
