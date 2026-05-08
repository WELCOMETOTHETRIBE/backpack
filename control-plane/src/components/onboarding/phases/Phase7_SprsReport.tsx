"use client";

import { useState, useMemo } from "react";
import { VAULT_CONTROL_MAP } from "@/data/vault-control-map";

interface ControlAdjudicationResult {
  controlId: string;
  tier: string;
  status: string;
  narrative?: string;
  poamTargetDate?: string;
  poamNotes?: string;
  needsReview?: boolean;
}

interface Phase7Props {
  phaseData: Record<string, unknown>;
  onComplete: (data: Record<string, unknown>) => void;
}

interface FamilyScore {
  family: string;
  familyName: string;
  totalWeight: number;
  earnedWeight: number;
  controls: number;
  resolved: number;
  poamItems: number;
}

interface PoamRow {
  controlId: string;
  family: string;
  familyName: string;
  title: string;
  sprsWeight: number;
  targetDate: string;
  notes: string;
}

function computeScoring(adjudications: ControlAdjudicationResult[]) {
  const adjMap = new Map(adjudications.map((a) => [a.controlId, a]));

  let currentScore = 110;
  let projectedScore = 110;
  const familyMap = new Map<string, FamilyScore>();
  const poamRows: PoamRow[] = [];

  for (const ctrl of VAULT_CONTROL_MAP) {
    if (!familyMap.has(ctrl.family)) {
      familyMap.set(ctrl.family, {
        family: ctrl.family,
        familyName: ctrl.familyName,
        totalWeight: 0,
        earnedWeight: 0,
        controls: 0,
        resolved: 0,
        poamItems: 0,
      });
    }
    const fs = familyMap.get(ctrl.family)!;
    fs.controls++;
    fs.totalWeight += ctrl.sprsWeight;

    const adj = adjMap.get(ctrl.controlId);
    const status = adj?.status ?? "not_started";

    if (status === "implemented" || status === "inherited" || status === "not_applicable" || status === "mactech_portion_accepted") {
      // Fully or partially met — does not deduct from DoD perspective
      // (mactech_portion_accepted + inherited + N/A = no deduction)
      fs.earnedWeight += ctrl.sprsWeight;
      fs.resolved++;
    } else if (status === "planned") {
      // POA&M item — deducts from current, not projected
      currentScore -= ctrl.sprsWeight;
      fs.poamItems++;
      poamRows.push({
        controlId: ctrl.controlId,
        family: ctrl.family,
        familyName: ctrl.familyName,
        title: ctrl.title,
        sprsWeight: ctrl.sprsWeight,
        targetDate: adj?.poamTargetDate ?? "",
        notes: adj?.poamNotes ?? "",
      });
    } else if (status === "not_applicable_customer") {
      fs.earnedWeight += ctrl.sprsWeight;
      fs.resolved++;
    } else {
      // not_started, unresolved — deducts from both
      currentScore -= ctrl.sprsWeight;
      projectedScore -= ctrl.sprsWeight;
    }
  }

  // Sort poam rows by family then controlId
  poamRows.sort((a, b) => a.controlId.localeCompare(b.controlId));

  return {
    currentScore: Math.max(currentScore, -203), // DoD floor is -203
    projectedScore: Math.max(projectedScore, -203),
    familyScores: Array.from(familyMap.values()).sort((a, b) => a.family.localeCompare(b.family)),
    poamRows,
  };
}

function scoreColor(score: number) {
  if (score >= 80) return "text-[#10B981]";
  if (score >= 50) return "text-[#F59E0B]";
  return "text-[#EF4444]";
}

function scoreBarColor(score: number) {
  if (score >= 80) return "bg-[#10B981]";
  if (score >= 50) return "bg-[#F59E0B]";
  return "bg-[#EF4444]";
}

export function Phase7_SprsReport({ phaseData, onComplete }: Phase7Props) {
  const [sigName, setSigName] = useState("");
  const [attested, setAttested] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Collect all adjudications from phase data
  const adjudications = useMemo((): ControlAdjudicationResult[] => {
    const results: ControlAdjudicationResult[] = [];
    // Phase 3: N/A controls
    const p3 = phaseData["3"] as Record<string, unknown> | undefined;
    if (p3?.naControlsWritten) {
      for (const id of p3.naControlsWritten as string[]) {
        results.push({ controlId: id, tier: "not_applicable", status: "not_applicable" });
      }
    }
    // Phase 4: Azure inherited
    const p4 = phaseData["4"] as Record<string, unknown> | undefined;
    if (p4?.inheritedControlsAcknowledged) {
      for (const id of p4.inheritedControlsAcknowledged as string[]) {
        results.push({ controlId: id, tier: "azure_inherited", status: "inherited" });
      }
    }
    // Phase 6: customer adjudications
    const p6 = phaseData["6"] as Record<string, unknown> | undefined;
    if (p6?.adjudications) {
      for (const adj of p6.adjudications as ControlAdjudicationResult[]) {
        results.push(adj);
      }
    }
    return results;
  }, [phaseData]);

  const { currentScore, projectedScore, familyScores, poamRows } = useMemo(
    () => computeScoring(adjudications),
    [adjudications]
  );

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const canSubmit = attested && sigName.trim().length >= 3 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/onboarding/adjudicate-controls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adjudications: [] }), // triggers SPRS snapshot update
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to record SPRS attestation");
      }

      onComplete({
        sprsScore: currentScore,
        projectedScore,
        poamCount: poamRows.length,
        attestedBy: sigName.trim(),
        attestedAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="border-l-4 border-[#10B981] pl-4">
        <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
          SPRS Score & Gap Report
        </h3>
        <p className="text-xs text-[#94A3B8] mt-1">
          Review your Supplier Performance Risk System score, per-family coverage, and POA&M
          summary. A legal attestation is required before proceeding to SSP generation.
        </p>
      </div>

      {/* Score hero */}
      <div className="border border-[#1E2D3D] p-6 flex flex-col items-center gap-4">
        <p className="text-xs font-mono text-[#6B7280] uppercase tracking-widest">
          NIST SP 800-171 DoD Assessment Methodology
        </p>
        <div className="flex items-end gap-4">
          <div className="text-center">
            <p className="text-xs font-mono text-[#6B7280] uppercase mb-1">Current Score</p>
            <span className={`text-7xl font-mono font-bold ${scoreColor(currentScore)}`}>
              {currentScore}
            </span>
            <span className="text-2xl font-mono text-[#4B5563]"> / 110</span>
          </div>
          {poamRows.length > 0 && currentScore !== projectedScore && (
            <>
              <div className="text-[#4B5563] font-mono text-2xl mb-2">→</div>
              <div className="text-center">
                <p className="text-xs font-mono text-[#6B7280] uppercase mb-1">After POA&M</p>
                <span className={`text-5xl font-mono font-bold ${scoreColor(projectedScore)}`}>
                  {projectedScore}
                </span>
                <span className="text-xl font-mono text-[#4B5563]"> / 110</span>
              </div>
            </>
          )}
        </div>
        {poamRows.length > 0 && (
          <p className="text-xs font-mono text-[#94A3B8] text-center">
            Completing all {poamRows.length} POA&M item{poamRows.length !== 1 ? "s" : ""} will
            bring your score to{" "}
            <span className={`font-bold ${scoreColor(projectedScore)}`}>{projectedScore}</span>.
          </p>
        )}
        {poamRows.length === 0 && (
          <p className="text-xs font-mono text-[#10B981]">
            No POA&M items — all controls resolved.
          </p>
        )}
      </div>

      {/* Per-family bar chart */}
      <div className="border border-[#1E2D3D]">
        <div className="p-3 border-b border-[#1E2D3D]">
          <h4 className="text-xs font-mono text-[#94A3B8] uppercase tracking-widest">
            Coverage by Control Family
          </h4>
        </div>
        <div className="divide-y divide-[#1E2D3D]">
          {familyScores.map((fs) => {
            const pct = fs.totalWeight > 0 ? (fs.earnedWeight / fs.totalWeight) * 100 : 0;
            return (
              <div key={fs.family} className="p-3 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-[#8B5CF6] w-8">
                      {fs.family}
                    </span>
                    <span className="text-xs font-mono text-white">{fs.familyName}</span>
                    {fs.poamItems > 0 && (
                      <span className="text-xs font-mono text-[#F59E0B] border border-[#F59E0B]/30 bg-[#F59E0B]/5 px-1.5 py-0.5">
                        {fs.poamItems} POA&M
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono text-[#6B7280]">
                    <span>{fs.resolved}/{fs.controls}</span>
                    <span className={scoreColor(pct)}>{Math.round(pct)}%</span>
                  </div>
                </div>
                <div className="h-1.5 bg-[#1E2D3D] w-full">
                  <div
                    className={`h-1.5 transition-all duration-500 ${scoreBarColor(pct)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* POA&M summary table */}
      {poamRows.length > 0 && (
        <div className="border border-[#F59E0B]/30">
          <div className="p-3 border-b border-[#F59E0B]/30 bg-[#F59E0B]/5">
            <h4 className="text-xs font-mono text-[#F59E0B] uppercase tracking-widest">
              Plan of Action & Milestones — {poamRows.length} Item{poamRows.length !== 1 ? "s" : ""}
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-[#1E2D3D] text-[#6B7280]">
                  <th className="text-left p-2 pl-3">Control</th>
                  <th className="text-left p-2">Family</th>
                  <th className="text-right p-2">SPRS Risk</th>
                  <th className="text-left p-2">Target Date</th>
                  <th className="text-left p-2 pr-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2D3D]">
                {poamRows.map((row) => (
                  <tr key={row.controlId} className="hover:bg-[#1E2D3D]/20">
                    <td className="p-2 pl-3 text-[#F59E0B] font-bold">{row.controlId}</td>
                    <td className="p-2 text-[#94A3B8]">{row.family}</td>
                    <td className="p-2 text-right text-[#EF4444]">-{row.sprsWeight}</td>
                    <td className="p-2 text-white">
                      {row.targetDate
                        ? new Date(row.targetDate).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : <span className="text-[#6B7280]">—</span>}
                    </td>
                    <td className="p-2 pr-3 text-[#6B7280] max-w-[200px] truncate">
                      {row.notes || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[#F59E0B]/30 bg-[#F59E0B]/5">
                  <td colSpan={2} className="p-2 pl-3 text-[#F59E0B] font-bold">
                    Total SPRS at Risk
                  </td>
                  <td className="p-2 text-right font-bold text-[#EF4444]">
                    -{poamRows.reduce((s, r) => s + r.sprsWeight, 0)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Legal attestation */}
      <div className="border border-[#374151] p-4 flex flex-col gap-4">
        <h4 className="text-xs font-mono text-[#94A3B8] uppercase tracking-widest">
          SPRS Score Attestation
        </h4>
        <p className="text-xs text-[#94A3B8] leading-relaxed">
          I attest that this SPRS score of{" "}
          <strong className={`font-mono ${scoreColor(currentScore)}`}>{currentScore} / 110</strong>{" "}
          accurately reflects my organization's implementation of NIST SP 800-171 Rev 2 security
          requirements as of <strong className="text-white">{today}</strong>. I understand that
          false statements made in connection with a DoD contract or subcontract may constitute
          violations of{" "}
          <strong className="text-white">18 U.S.C. § 1001</strong> (False Statements Act) and the{" "}
          <strong className="text-white">False Claims Act (31 U.S.C. §§ 3729–3733)</strong>,
          subjecting my organization to civil and criminal penalties.
        </p>
        <div>
          <label className="block text-xs font-mono text-[#6B7280] uppercase tracking-wider mb-1">
            Authorized Signatory Name *
          </label>
          <input
            type="text"
            value={sigName}
            onChange={(e) => setSigName(e.target.value)}
            placeholder="Enter your full legal name"
            className="w-full bg-[#0D1117] border border-[#1E2D3D] text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#10B981]"
          />
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={attested}
            onChange={(e) => setAttested(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[#10B981] cursor-pointer flex-shrink-0"
          />
          <span className="text-sm text-[#94A3B8] leading-relaxed">
            I have read and understand the attestation above. I am authorized to submit this
            self-assessment on behalf of my organization and affirm the accuracy of the reported
            SPRS score.
          </span>
        </label>
      </div>

      {error && (
        <div className="border border-[#EF4444] bg-[#7F1D1D]/20 text-[#EF4444] text-sm font-mono px-3 py-2">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={`w-full py-3 text-sm font-mono font-bold uppercase tracking-widest transition-colors ${
          canSubmit
            ? "bg-[#10B981] text-black hover:bg-[#34D399] cursor-pointer"
            : "bg-[#1E2D3D] text-[#4B5563] cursor-not-allowed"
        }`}
      >
        {submitting
          ? "RECORDING ATTESTATION..."
          : `ATTEST SCORE & CONTINUE TO SSP GENERATION`}
      </button>
    </div>
  );
}
