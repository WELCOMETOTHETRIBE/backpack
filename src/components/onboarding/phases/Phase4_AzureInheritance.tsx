"use client";

import { useState } from "react";
import { AZURE_INHERITED_CONTROLS } from "@/data/vault-control-map";

interface Phase4Props {
  onComplete: (data: Record<string, unknown>) => void;
}

export function Phase4_AzureInheritance({ onComplete }: Phase4Props) {
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = AZURE_INHERITED_CONTROLS.length;
  const done = acknowledged.size;
  const allDone = done === total;

  function toggleAck(controlId: string) {
    setAcknowledged((prev) => {
      const next = new Set(prev);
      if (next.has(controlId)) {
        next.delete(controlId);
      } else {
        next.add(controlId);
      }
      return next;
    });
  }

  async function handleSubmit() {
    if (!allDone) return;
    setSubmitting(true);
    setError(null);

    try {
      const adjudications = AZURE_INHERITED_CONTROLS.map((ctrl) => ({
        controlId: ctrl.controlId,
        tier: "azure_inherited",
        status: "inherited",
        narrative:
          "Physical Protection controls are fully inherited from Microsoft Azure Government " +
          "(FedRAMP High Authorized). " +
          (ctrl.azureProvides?.join("; ") ?? "") +
          " MacTech Solutions LLC maintains the inherited control boundary documentation.",
        needsReview: false,
      }));

      const res = await fetch("/api/onboarding/adjudicate-controls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adjudications }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to record inherited controls");
      }

      const result = await res.json();
      onComplete({
        inheritedControlsAcknowledged: AZURE_INHERITED_CONTROLS.map((c) => c.controlId),
        sprsScore: result.sprsScore,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border-l-4 border-[#0EA5E9] pl-4">
        <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
          Azure Gov Inheritance — Physical Protection Family
        </h3>
        <p className="text-xs text-[#94A3B8] mt-1">
          All 6 Physical Protection (PE) controls are inherited from Microsoft Azure
          Government's FedRAMP High authorization. Review and acknowledge each control.
        </p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1 bg-[#1E2D3D]">
          <div
            className="h-1 bg-[#0EA5E9] transition-all duration-300"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
        <span className="text-xs font-mono text-[#94A3B8]">
          {done} / {total} acknowledged
        </span>
      </div>

      {/* Control cards */}
      <div className="flex flex-col gap-3">
        {AZURE_INHERITED_CONTROLS.map((ctrl) => {
          const isAcked = acknowledged.has(ctrl.controlId);
          return (
            <div
              key={ctrl.controlId}
              className={`border p-4 transition-colors ${
                isAcked
                  ? "border-[#0EA5E9] bg-[#0EA5E9]/5"
                  : "border-[#1E2D3D]"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-mono text-[#0EA5E9] font-bold">
                      {ctrl.controlId}
                    </span>
                    <span className="text-xs font-mono text-[#6B7280] bg-[#0EA5E9]/10 px-1.5 py-0.5">
                      INHERITED
                    </span>
                    <span className="text-xs font-mono text-[#F59E0B]">
                      -{ctrl.sprsWeight} pts if not met
                    </span>
                  </div>
                  <p className="text-sm text-white font-mono mb-3">{ctrl.title}</p>
                  <div className="flex flex-col gap-1">
                    {ctrl.azureProvides?.map((item, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-[#0EA5E9] text-xs mt-0.5">▸</span>
                        <span className="text-xs text-[#94A3B8]">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleAck(ctrl.controlId)}
                  className={`flex-shrink-0 px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider border transition-colors ${
                    isAcked
                      ? "bg-[#0EA5E9] border-[#0EA5E9] text-black"
                      : "bg-transparent border-[#374151] text-[#94A3B8] hover:border-[#0EA5E9] hover:text-[#0EA5E9]"
                  }`}
                >
                  {isAcked ? "✓ ACKNOWLEDGED" : "ACKNOWLEDGE"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Evidence collector explainer — what the customer does AFTER onboarding */}
      <section className="border border-[#0EA5E9]/40 bg-[#0EA5E9]/5 p-4">
        <h4 className="text-xs font-mono font-bold text-[#0EA5E9] uppercase tracking-widest mb-2">
          Two evidence collectors back these claims
        </h4>
        <p className="text-xs text-[#94A3B8] font-mono leading-relaxed mb-3">
          The 6 Physical Protection controls above are inherited unconditionally
          from Azure Gov FedRAMP High. The other 12 cloud-touching controls
          (3.1.13/14, 3.3.1/2, 3.5.3-6, 3.7.5, 3.13.5/8/10) require an actual
          Azure validator run against your tenant. After onboarding, you&apos;ll run
          two scripts and upload both reports:
        </p>
        <ul className="space-y-2 text-xs font-mono">
          <li className="flex items-start gap-2">
            <span className="text-[#0EA5E9] mt-0.5">1.</span>
            <span className="text-[#94A3B8]">
              <span className="text-white">OS Collector</span> — runs on the Windows
              VM (<code className="text-[#0EA5E9]">Collect-Cui-Evidence-v2.ps1</code>),
              produces evidence for 73 OS-level controls.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#0EA5E9] mt-0.5">2.</span>
            <span className="text-[#94A3B8]">
              <span className="text-white">Azure/Entra Collector</span> — runs on
              any machine with <code className="text-[#0EA5E9]">az login</code>{" "}
              (<code className="text-[#0EA5E9]">export_azure_evidence.sh</code>{" "}
              or <code className="text-[#0EA5E9]">Collect-AzureEntraEvidence.ps1</code>),
              produces evidence for 12 cloud controls.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#0EA5E9] mt-0.5">3.</span>
            <span className="text-[#94A3B8]">
              Both produce a <code className="text-[#0EA5E9]">validation-report-*.json</code>{" "}
              that you upload at{" "}
              <span className="text-white">/dashboard/os-baselines/boundaries/&lt;id&gt;</span>.
            </span>
          </li>
        </ul>
        <p className="text-xs text-[#6B7280] font-mono mt-3 leading-relaxed">
          Or use the unified runner:{" "}
          <code className="text-[#0EA5E9]">Run-CuiAndAzureBulkEvidenceAndValidate.ps1</code>{" "}
          — one command, one RunId, both bundles. We&apos;ll surface this on your
          dashboard once you finish onboarding.
        </p>
      </section>

      {error && (
        <div className="border border-[#EF4444] bg-[#7F1D1D]/20 text-[#EF4444] text-sm font-mono px-3 py-2">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!allDone || submitting}
        className={`w-full py-3 text-sm font-mono font-bold uppercase tracking-widest transition-colors ${
          allDone && !submitting
            ? "bg-[#0EA5E9] text-black hover:bg-[#38BDF8] cursor-pointer"
            : "bg-[#1E2D3D] text-[#4B5563] cursor-not-allowed"
        }`}
      >
        {submitting
          ? "RECORDING INHERITED CONTROLS..."
          : `RECORD ${total} INHERITED CONTROLS & CONTINUE`}
      </button>
    </div>
  );
}
