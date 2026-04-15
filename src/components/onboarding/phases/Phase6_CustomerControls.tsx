"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  CUSTOMER_ATTESTATION_CONTROLS,
  VAULT_CONTROL_MAP,
  type VaultControl,
} from "@/data/vault-control-map";
import { calculateSprsScore } from "@/lib/sprs/sprs_calculator";

type ControlStatus = "implemented" | "planned" | "not_applicable" | null;

interface ControlState {
  status: ControlStatus;
  poamDate?: string;
  poamNotes?: string;
  naJustification?: string;
  attestedAt?: string;
}

interface Phase6Props {
  onComplete: (data: Record<string, unknown>) => void;
}

// All controls the customer must adjudicate (shared + customer_managed)
const CONTROLS = CUSTOMER_ATTESTATION_CONTROLS;

function buildFamilyGroups(): Record<string, VaultControl[]> {
  const groups: Record<string, VaultControl[]> = {};
  for (const ctrl of CONTROLS) {
    if (!groups[ctrl.family]) groups[ctrl.family] = [];
    groups[ctrl.family].push(ctrl);
  }
  return groups;
}

function computeLiveSprs(states: Record<string, ControlState>): number {
  const implementations = VAULT_CONTROL_MAP.map((ctrl) => {
    const state = states[ctrl.controlId];
    return {
      controlId: ctrl.controlId,
      isImplemented:
        ctrl.tier === "azure_inherited" ||
        ctrl.tier === "not_applicable" ||
        state?.status === "implemented" ||
        state?.status === "not_applicable",
    };
  });
  return calculateSprsScore(implementations);
}

export function Phase6_CustomerControls({ onComplete }: Phase6Props) {
  const familyGroups = useMemo(() => buildFamilyGroups(), []);
  const familyKeys = useMemo(
    () => Object.keys(familyGroups).sort(),
    [familyGroups]
  );

  const [activeFamily, setActiveFamily] = useState(familyKeys[0] ?? "");
  const [states, setStates] = useState<Record<string, ControlState>>({});
  const [expandedControls, setExpandedControls] = useState<Set<string>>(new Set());
  const [poamModal, setPoamModal] = useState<string | null>(null);
  const [naModal, setNaModal] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live SPRS score derived from current states
  const liveSprs = useMemo(() => computeLiveSprs(states), [states]);

  // Resolved = has a status
  const resolvedCount = CONTROLS.filter((c) => states[c.controlId]?.status != null).length;
  const totalCount = CONTROLS.length;
  const allResolved = resolvedCount === totalCount;

  function setControlStatus(controlId: string, status: ControlStatus) {
    setStates((prev) => ({
      ...prev,
      [controlId]: {
        ...(prev[controlId] ?? {}),
        status,
        attestedAt: status === "implemented" ? new Date().toISOString() : undefined,
      },
    }));
  }

  function setPoamData(controlId: string, date: string, notes: string) {
    setStates((prev) => ({
      ...prev,
      [controlId]: {
        status: "planned",
        poamDate: date,
        poamNotes: notes,
      },
    }));
    setPoamModal(null);
  }

  function setNaData(controlId: string, justification: string) {
    setStates((prev) => ({
      ...prev,
      [controlId]: {
        status: "not_applicable",
        naJustification: justification,
      },
    }));
    setNaModal(null);
  }

  function toggleExpand(controlId: string) {
    setExpandedControls((prev) => {
      const next = new Set(prev);
      if (next.has(controlId)) next.delete(controlId);
      else next.add(controlId);
      return next;
    });
  }

  async function handleSubmit() {
    if (!allResolved) return;
    setSubmitting(true);
    setError(null);

    try {
      const adjudications = CONTROLS.map((ctrl) => {
        const state = states[ctrl.controlId]!;
        return {
          controlId: ctrl.controlId,
          tier: ctrl.tier,
          status: state.status!,
          narrative: deriveNarrative(ctrl, state),
          poamTargetDate: state.poamDate,
          poamNotes: state.poamNotes,
          needsReview: ctrl.needsReview ?? false,
          needsReviewReason: ctrl.needsReviewReason,
        };
      });

      const res = await fetch("/api/onboarding/adjudicate-controls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adjudications }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to record adjudications");
      }

      const result = await res.json();
      onComplete({
        controlsAdjudicated: totalCount,
        sprsScore: result.sprsScore,
        implemented: result.implemented,
        planned: result.planned,
        notApplicable: result.notApplicable,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setSubmitting(false);
    }
  }

  const activeFamilyControls = familyGroups[activeFamily] ?? [];
  const activeFamilyResolved = activeFamilyControls.filter(
    (c) => states[c.controlId]?.status != null
  ).length;

  return (
    <div className="flex gap-4">
      {/* Sidebar: family nav + SPRS score */}
      <div className="w-48 flex-shrink-0 flex flex-col gap-2">
        {/* Live SPRS */}
        <div className="border border-[#1E2D3D] p-3 text-center">
          <p className="text-xs font-mono text-[#6B7280] uppercase tracking-wider mb-1">
            Live SPRS Score
          </p>
          <p
            className={`text-3xl font-mono font-bold ${
              liveSprs >= 80
                ? "text-[#10B981]"
                : liveSprs >= 50
                ? "text-[#F59E0B]"
                : "text-[#EF4444]"
            }`}
          >
            {liveSprs}
          </p>
          <p className="text-xs text-[#6B7280] font-mono">{resolvedCount}/{totalCount} resolved</p>
        </div>

        {/* Family tabs */}
        <div className="flex flex-col gap-0.5">
          {familyKeys.map((family) => {
            const familyControls = familyGroups[family];
            const familyResolved = familyControls.filter(
              (c) => states[c.controlId]?.status != null
            ).length;
            const familyComplete = familyResolved === familyControls.length;

            return (
              <button
                key={family}
                type="button"
                onClick={() => setActiveFamily(family)}
                className={`text-left px-2 py-1.5 text-xs font-mono flex items-center justify-between transition-colors ${
                  activeFamily === family
                    ? "bg-[#0EA5E9]/10 border-l-2 border-[#0EA5E9] text-[#0EA5E9]"
                    : "text-[#6B7280] hover:text-[#94A3B8] border-l-2 border-transparent"
                }`}
              >
                <span>{family}</span>
                <span
                  className={`text-xs ${
                    familyComplete ? "text-[#10B981]" : "text-[#374151]"
                  }`}
                >
                  {familyResolved}/{familyControls.length}
                </span>
              </button>
            );
          })}
        </div>

        {/* Submit button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!allResolved || submitting}
          className={`mt-auto py-2 text-xs font-mono font-bold uppercase tracking-wider transition-colors ${
            allResolved && !submitting
              ? "bg-[#10B981] text-black hover:bg-[#34D399] cursor-pointer"
              : "bg-[#1E2D3D] text-[#4B5563] cursor-not-allowed"
          }`}
        >
          {submitting ? "SAVING..." : allResolved ? "COMPLETE" : `${totalCount - resolvedCount} REMAINING`}
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {/* Family header */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-mono font-bold text-white">
              {activeFamilyControls[0]?.familyName ?? activeFamily}
            </span>
            <span className="text-xs text-[#6B7280] font-mono ml-2">
              ({activeFamilyResolved}/{activeFamilyControls.length} resolved)
            </span>
          </div>
        </div>

        {/* Control cards */}
        {activeFamilyControls.map((ctrl) => {
          const state = states[ctrl.controlId];
          const isExpanded = expandedControls.has(ctrl.controlId);
          const statusColor = getStatusColor(state?.status);

          return (
            <div
              key={ctrl.controlId}
              className={`border-l-4 border border-[#1E2D3D] transition-colors ${statusColor.border}`}
            >
              {/* Card header */}
              <div
                className="flex items-start gap-3 p-3 cursor-pointer hover:bg-[#1E2D3D]/20"
                onClick={() => toggleExpand(ctrl.controlId)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs font-mono font-bold text-[#94A3B8]">
                      {ctrl.controlId}
                    </span>
                    <span
                      className={`text-xs font-mono px-1.5 py-0.5 border ${
                        ctrl.tier === "customer_managed"
                          ? "text-[#EF4444] border-[#EF4444]/30 bg-[#EF4444]/5"
                          : "text-[#8B5CF6] border-[#8B5CF6]/30 bg-[#8B5CF6]/5"
                      }`}
                    >
                      {ctrl.tier === "customer_managed" ? "CUSTOMER" : "SHARED"}
                    </span>
                    <span className="text-xs font-mono text-[#F59E0B]">
                      {ctrl.sprsWeight}pt
                    </span>
                    {ctrl.needsReview && (
                      <span className="text-xs font-mono text-[#F59E0B] bg-[#F59E0B]/10 border border-[#F59E0B]/30 px-1.5 py-0.5">
                        ⚠ NEEDS REVIEW
                      </span>
                    )}
                    {state?.status && (
                      <span
                        className={`text-xs font-mono px-1.5 py-0.5 ${statusColor.badge}`}
                      >
                        {state.status === "implemented"
                          ? "✓ IMPLEMENTED"
                          : state.status === "planned"
                          ? "📋 POA&M"
                          : "N/A"}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-white font-mono leading-snug">{ctrl.title}</p>
                </div>
                <span className="text-[#6B7280] text-xs font-mono flex-shrink-0">
                  {isExpanded ? "▲" : "▼"}
                </span>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t border-[#1E2D3D] p-3 flex flex-col gap-3">
                  {/* NEEDS REVIEW banner */}
                  {ctrl.needsReview && (
                    <div className="border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-2">
                      <p className="text-xs font-mono text-[#F59E0B] font-bold mb-1">
                        ⚠ NEEDS HUMAN REVIEW BEFORE ATTESTATION
                      </p>
                      <p className="text-xs text-[#D97706] italic">
                        {ctrl.needsReviewReason}
                      </p>
                    </div>
                  )}

                  {/* Customer question */}
                  <div className="bg-[#0D1117] border border-[#1E2D3D] p-3">
                    <p className="text-xs font-mono text-[#6B7280] uppercase tracking-wider mb-1">
                      Assessment Question
                    </p>
                    <p className="text-sm text-[#E2E8F0] leading-relaxed">
                      {ctrl.customerQuestion}
                    </p>
                  </div>

                  {/* Customer requirements */}
                  {ctrl.customerRequired && ctrl.customerRequired.length > 0 && (
                    <div>
                      <p className="text-xs font-mono text-[#6B7280] uppercase tracking-wider mb-1">
                        Your Organization Must:
                      </p>
                      <ul className="flex flex-col gap-1">
                        {ctrl.customerRequired.map((req, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-[#F59E0B] text-xs mt-0.5">▸</span>
                            <span className="text-xs text-[#94A3B8]">{req}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Technical evidence */}
                  {ctrl.evidenceFiles && ctrl.evidenceFiles.length > 0 && (
                    <div>
                      <p className="text-xs font-mono text-[#6B7280] uppercase tracking-wider mb-1">
                        Collector Evidence Available
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {ctrl.evidenceFiles.slice(0, 5).map((f) => (
                          <span
                            key={f}
                            className="text-xs font-mono text-[#10B981] border border-[#10B981]/20 bg-[#10B981]/5 px-1.5 py-0.5"
                          >
                            {f.split("/").pop()}
                          </span>
                        ))}
                        {ctrl.evidenceFiles.length > 5 && (
                          <span className="text-xs text-[#6B7280] font-mono px-1.5 py-0.5">
                            +{ctrl.evidenceFiles.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* POA&M detail if in POA&M */}
                  {state?.status === "planned" && (
                    <div className="border border-[#F59E0B]/20 bg-[#F59E0B]/5 p-2">
                      <p className="text-xs font-mono text-[#F59E0B] uppercase tracking-wider mb-1">
                        POA&M Entry
                      </p>
                      <p className="text-xs text-[#94A3B8]">
                        Target date: {state.poamDate || "Not set"}
                      </p>
                      {state.poamNotes && (
                        <p className="text-xs text-[#94A3B8] mt-1">{state.poamNotes}</p>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setControlStatus(ctrl.controlId, "implemented")}
                      disabled={ctrl.needsReview && state?.status !== "implemented"}
                      className={`px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider border transition-colors ${
                        state?.status === "implemented"
                          ? "bg-[#10B981] border-[#10B981] text-black"
                          : ctrl.needsReview
                          ? "bg-transparent border-[#374151] text-[#4B5563] cursor-not-allowed"
                          : "bg-transparent border-[#10B981] text-[#10B981] hover:bg-[#10B981] hover:text-black"
                      }`}
                    >
                      ✓ Attest Implemented
                    </button>
                    <button
                      type="button"
                      onClick={() => setPoamModal(ctrl.controlId)}
                      className={`px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider border transition-colors ${
                        state?.status === "planned"
                          ? "bg-[#F59E0B] border-[#F59E0B] text-black"
                          : "bg-transparent border-[#F59E0B] text-[#F59E0B] hover:bg-[#F59E0B] hover:text-black"
                      }`}
                    >
                      📋 Add to POA&M
                    </button>
                    <button
                      type="button"
                      onClick={() => setNaModal(ctrl.controlId)}
                      className={`px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider border transition-colors ${
                        state?.status === "not_applicable"
                          ? "bg-[#6B7280] border-[#6B7280] text-black"
                          : "bg-transparent border-[#374151] text-[#6B7280] hover:border-[#6B7280] hover:text-white"
                      }`}
                    >
                      N/A — Explain
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {error && (
          <div className="border border-[#EF4444] bg-[#7F1D1D]/20 text-[#EF4444] text-sm font-mono px-3 py-2">
            {error}
          </div>
        )}
      </div>

      {/* POA&M Modal */}
      {poamModal && (
        <PoamModal
          controlId={poamModal}
          initialDate={states[poamModal]?.poamDate ?? ""}
          initialNotes={states[poamModal]?.poamNotes ?? ""}
          onSave={(date, notes) => setPoamData(poamModal, date, notes)}
          onClose={() => setPoamModal(null)}
        />
      )}

      {/* N/A Modal */}
      {naModal && (
        <NaModal
          controlId={naModal}
          initialJustification={states[naModal]?.naJustification ?? ""}
          onSave={(justification) => setNaData(naModal, justification)}
          onClose={() => setNaModal(null)}
        />
      )}
    </div>
  );
}

function getStatusColor(status: ControlStatus | undefined) {
  switch (status) {
    case "implemented":
      return { border: "border-l-[#10B981]", badge: "bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/30" };
    case "planned":
      return { border: "border-l-[#F59E0B]", badge: "bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/30" };
    case "not_applicable":
      return { border: "border-l-[#6B7280]", badge: "bg-[#6B7280]/10 text-[#6B7280] border border-[#6B7280]/30" };
    default:
      return { border: "border-l-[#374151]", badge: "" };
  }
}

function deriveNarrative(ctrl: VaultControl, state: ControlState): string {
  if (state.status === "implemented") {
    return (
      `${ctrl.title} is implemented. ` +
      (ctrl.mactechProvides?.length
        ? `MacTech provides: ${ctrl.mactechProvides[0]}. `
        : "") +
      `Customer organization has attested implementation of: ${ctrl.customerRequired?.join("; ") ?? "required obligations"}.`
    );
  }
  if (state.status === "planned") {
    return `Planned remediation by ${state.poamDate ?? "TBD"}. Notes: ${state.poamNotes ?? "See POA&M."}`;
  }
  if (state.status === "not_applicable") {
    return state.naJustification ?? "Not applicable per organizational determination.";
  }
  return "";
}

function PoamModal({
  controlId,
  initialDate,
  initialNotes,
  onSave,
  onClose,
}: {
  controlId: string;
  initialDate: string;
  initialNotes: string;
  onSave: (date: string, notes: string) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [notes, setNotes] = useState(initialNotes);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0A0D12] border border-[#1E2D3D] w-full max-w-md p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-mono font-bold text-[#F59E0B] uppercase tracking-wider">
            Add to POA&M — {controlId}
          </h4>
          <button onClick={onClose} className="text-[#6B7280] hover:text-white text-lg font-mono">
            ×
          </button>
        </div>
        <div>
          <label className="block text-xs font-mono text-[#94A3B8] uppercase tracking-wider mb-1">
            Target Completion Date *
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-[#0D1117] border border-[#1E2D3D] text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#F59E0B]"
          />
        </div>
        <div>
          <label className="block text-xs font-mono text-[#94A3B8] uppercase tracking-wider mb-1">
            Mitigation Notes *
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Describe your planned remediation approach and any interim mitigations."
            className="w-full bg-[#0D1117] border border-[#1E2D3D] text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#F59E0B] resize-none"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onSave(date, notes)}
            disabled={!date || !notes.trim()}
            className={`flex-1 py-2 text-xs font-mono font-bold uppercase tracking-wider ${
              date && notes.trim()
                ? "bg-[#F59E0B] text-black hover:bg-[#FCD34D]"
                : "bg-[#1E2D3D] text-[#4B5563] cursor-not-allowed"
            }`}
          >
            SAVE POA&M ENTRY
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-mono text-[#6B7280] border border-[#1E2D3D] hover:border-[#374151]"
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}

function NaModal({
  controlId,
  initialJustification,
  onSave,
  onClose,
}: {
  controlId: string;
  initialJustification: string;
  onSave: (justification: string) => void;
  onClose: () => void;
}) {
  const [justification, setJustification] = useState(initialJustification);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0A0D12] border border-[#1E2D3D] w-full max-w-md p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-mono font-bold text-[#6B7280] uppercase tracking-wider">
            Mark N/A — {controlId}
          </h4>
          <button onClick={onClose} className="text-[#6B7280] hover:text-white text-lg font-mono">
            ×
          </button>
        </div>
        <div>
          <label className="block text-xs font-mono text-[#94A3B8] uppercase tracking-wider mb-1">
            Justification *
          </label>
          <textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            rows={4}
            placeholder="Explain why this control is not applicable to your organization or this boundary."
            className="w-full bg-[#0D1117] border border-[#1E2D3D] text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#6B7280] resize-none"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onSave(justification)}
            disabled={!justification.trim()}
            className={`flex-1 py-2 text-xs font-mono font-bold uppercase tracking-wider ${
              justification.trim()
                ? "bg-[#6B7280] text-black hover:bg-[#9CA3AF]"
                : "bg-[#1E2D3D] text-[#4B5563] cursor-not-allowed"
            }`}
          >
            MARK N/A
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-mono text-[#6B7280] border border-[#1E2D3D] hover:border-[#374151]"
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}
