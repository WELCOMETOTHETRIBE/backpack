"use client";

import { useState, useEffect } from "react";

interface Phase8Props {
  phaseData: Record<string, unknown>;
  onComplete: (data: Record<string, unknown>) => void;
}

type GenerationStep =
  | "idle"
  | "generating"
  | "reviewing"
  | "signing"
  | "complete";

interface SspSummary {
  sha256: string;
  generatedAt: string;
  controlCount: number;
  poamCount: number;
  sprsScore: number;
  documentId: string;
}

export function Phase8_SspGeneration({ phaseData, onComplete }: Phase8Props) {
  const [step, setStep] = useState<GenerationStep>("idle");
  const [progress, setProgress] = useState(0);
  const [sspSummary, setSspSummary] = useState<SspSummary | null>(null);
  const [sigName, setSigName] = useState("");
  const [sigTitle, setSigTitle] = useState("");
  const [attested, setAttested] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sprsScore = (phaseData["7"] as Record<string, unknown> | undefined)?.sprsScore as number ?? 0;
  const poamCount = (phaseData["7"] as Record<string, unknown> | undefined)?.poamCount as number ?? 0;

  // Prefill signatory from Phase 0 Trust Codex data
  useEffect(() => {
    const p0 = phaseData["0"] as Record<string, unknown> | undefined;
    if (p0?.signatoryName) setSigName(p0.signatoryName as string);
    if (p0?.signatoryTitle) setSigTitle(p0.signatoryTitle as string);
  }, [phaseData]);

  async function generateSsp() {
    setStep("generating");
    setProgress(0);
    setError(null);

    // Animate progress during generation
    const interval = setInterval(() => {
      setProgress((prev) => Math.min(prev + 8, 88));
    }, 200);

    try {
      const p1 = phaseData["1"] as Record<string, unknown> | undefined;
      const p2 = phaseData["2"] as Record<string, unknown> | undefined;

      const res = await fetch("/api/onboarding/generate-ssp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationProfile: p1,
          cuiCategories: p2?.categories,
          cuiNarrative: p2?.narrative,
        }),
      });

      clearInterval(interval);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "SSP generation failed");
      }

      const data = await res.json();
      setProgress(100);

      setSspSummary({
        sha256: data.sha256,
        generatedAt: data.generatedAt,
        controlCount: 110,
        poamCount,
        sprsScore,
        documentId: `SSP-${new Date(data.generatedAt).getFullYear()}-${data.sha256.slice(0, 8).toUpperCase()}`,
      });

      setTimeout(() => setStep("reviewing"), 400);
    } catch (err) {
      clearInterval(interval);
      setError(err instanceof Error ? err.message : "An error occurred");
      setStep("idle");
    }
  }

  async function handleSign() {
    if (!attested || sigName.trim().length < 3 || sigTitle.trim().length < 3) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/onboarding/save-phase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: 8,
          data: {
            sspDocumentId: sspSummary?.documentId,
            sspSha256: sspSummary?.sha256,
            sspGeneratedAt: sspSummary?.generatedAt,
            signedBy: sigName.trim(),
            signatoryTitle: sigTitle.trim(),
            signedAt: new Date().toISOString(),
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to record SSP signature");
      }

      setStep("complete");
      onComplete({
        sspDocumentId: sspSummary?.documentId,
        sspSha256: sspSummary?.sha256,
        sspGeneratedAt: sspSummary?.generatedAt,
        signedBy: sigName.trim(),
        signedAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setSubmitting(false);
    }
  }

  function scoreColor(score: number) {
    if (score >= 80) return "text-[#10B981]";
    if (score >= 50) return "text-[#F59E0B]";
    return "text-[#EF4444]";
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="border-l-4 border-[#0EA5E9] pl-4">
        <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
          System Security Plan Generation
        </h3>
        <p className="text-xs text-[#94A3B8] mt-1">
          Generate your NIST SP 800-171 System Security Plan. The SSP captures all 110 control
          adjudications, POA&M items, and the MacTech Trust Codex inheritance record in a
          machine-verifiable document with SHA-256 integrity hash.
        </p>
      </div>

      {/* Step: idle */}
      {step === "idle" && (
        <div className="flex flex-col gap-4">
          <div className="border border-[#1E2D3D] p-4 grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-xs font-mono text-[#6B7280] uppercase mb-1">Controls</p>
              <p className="text-2xl font-mono font-bold text-white">110</p>
            </div>
            <div className="text-center border-x border-[#1E2D3D]">
              <p className="text-xs font-mono text-[#6B7280] uppercase mb-1">SPRS Score</p>
              <p className={`text-2xl font-mono font-bold ${scoreColor(sprsScore)}`}>{sprsScore}</p>
            </div>
            <div className="text-center">
              <p className="text-xs font-mono text-[#6B7280] uppercase mb-1">POA&M Items</p>
              <p className={`text-2xl font-mono font-bold ${poamCount > 0 ? "text-[#F59E0B]" : "text-[#10B981]"}`}>
                {poamCount}
              </p>
            </div>
          </div>
          <div className="border border-[#1E2D3D] p-4 flex flex-col gap-2">
            <p className="text-xs font-mono text-[#94A3B8] uppercase tracking-wider">
              SSP will include:
            </p>
            {[
              "Cover page with org profile, system boundary, and CAGE code",
              "All 110 NIST SP 800-171 Rev 2 controls with implementation narratives",
              "Azure Government FedRAMP High inheritance documentation (6 PE controls)",
              "MacTech Trust Codex coverage record with governance document index",
              "Customer attestation records with timestamps and user IDs",
              "POA&M appendix with target dates and remediation notes",
              "SHA-256 integrity hash for tamper-evidence verification",
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-[#0EA5E9] text-xs mt-0.5 flex-shrink-0">▸</span>
                <span className="text-xs text-[#94A3B8]">{item}</span>
              </div>
            ))}
          </div>
          {error && (
            <div className="border border-[#EF4444] bg-[#7F1D1D]/20 text-[#EF4444] text-sm font-mono px-3 py-2">
              {error}
            </div>
          )}
          <button
            type="button"
            onClick={generateSsp}
            className="w-full py-3 text-sm font-mono font-bold uppercase tracking-widest bg-[#0EA5E9] text-black hover:bg-[#38BDF8] transition-colors cursor-pointer"
          >
            GENERATE SYSTEM SECURITY PLAN
          </button>
        </div>
      )}

      {/* Step: generating */}
      {step === "generating" && (
        <div className="flex flex-col items-center gap-6 py-8">
          <div className="text-center">
            <p className="text-xs font-mono text-[#6B7280] uppercase tracking-widest mb-2">
              Generating SSP
            </p>
            <p className="text-sm font-mono text-white">
              Compiling 110 control adjudications...
            </p>
          </div>
          <div className="w-full max-w-sm flex flex-col gap-2">
            <div className="h-2 bg-[#1E2D3D] w-full">
              <div
                className="h-2 bg-[#0EA5E9] transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs font-mono text-[#6B7280] text-right">{progress}%</p>
          </div>
          <div className="flex flex-col gap-1.5 w-full max-w-sm">
            {[
              { label: "Control adjudications", done: progress >= 20 },
              { label: "Trust Codex inheritance record", done: progress >= 40 },
              { label: "POA&M appendix", done: progress >= 60 },
              { label: "Governance document index", done: progress >= 75 },
              { label: "SHA-256 integrity hash", done: progress >= 95 },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <span
                  className={`text-xs font-mono ${
                    item.done ? "text-[#10B981]" : "text-[#374151]"
                  }`}
                >
                  {item.done ? "✓" : "○"}
                </span>
                <span
                  className={`text-xs font-mono ${
                    item.done ? "text-[#94A3B8]" : "text-[#374151]"
                  }`}
                >
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step: reviewing */}
      {step === "reviewing" && sspSummary && (
        <div className="flex flex-col gap-4">
          <div className="border border-[#10B981]/30 bg-[#10B981]/5 p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[#10B981] font-mono">✓</span>
              <p className="text-xs font-mono text-[#10B981] uppercase tracking-wider font-bold">
                SSP Generated Successfully
              </p>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <div>
                <p className="text-xs font-mono text-[#6B7280] uppercase">Document ID</p>
                <p className="text-sm font-mono text-white">{sspSummary.documentId}</p>
              </div>
              <div>
                <p className="text-xs font-mono text-[#6B7280] uppercase">Generated</p>
                <p className="text-sm font-mono text-white">
                  {new Date(sspSummary.generatedAt).toLocaleString()}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-xs font-mono text-[#6B7280] uppercase mb-1">
                  SHA-256 Integrity Hash
                </p>
                <p className="text-xs font-mono text-[#0EA5E9] break-all bg-[#0D1117] p-2 border border-[#1E2D3D]">
                  {sspSummary.sha256}
                </p>
              </div>
            </div>
          </div>

          <div className="border border-[#1E2D3D] p-4 flex flex-col gap-2">
            <p className="text-xs font-mono text-[#6B7280] uppercase tracking-wider">
              Document Summary
            </p>
            {[
              { label: "Control Framework", value: "NIST SP 800-171 Rev 2" },
              { label: "Total Controls", value: "110 / 110 adjudicated" },
              { label: "SPRS Score", value: `${sspSummary.sprsScore} / 110` },
              { label: "POA&M Items", value: `${sspSummary.poamCount}` },
              { label: "System Boundary", value: "Windows Server 2025 VM on Azure Government" },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#6B7280]">{row.label}</span>
                <span className="text-white">{row.value}</span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setStep("signing")}
            className="w-full py-3 text-sm font-mono font-bold uppercase tracking-widest bg-[#0EA5E9] text-black hover:bg-[#38BDF8] transition-colors cursor-pointer"
          >
            REVIEW COMPLETE — PROCEED TO SIGN
          </button>
        </div>
      )}

      {/* Step: signing */}
      {step === "signing" && sspSummary && (
        <div className="flex flex-col gap-4">
          {/* SSP reference */}
          <div className="border border-[#1E2D3D] px-3 py-2 flex items-center justify-between">
            <span className="text-xs font-mono text-[#6B7280]">Document ID:</span>
            <span className="text-xs font-mono text-white">{sspSummary.documentId}</span>
          </div>

          {/* Attestation */}
          <div className="border border-[#374151] p-4 flex flex-col gap-4">
            <h4 className="text-xs font-mono text-[#94A3B8] uppercase tracking-widest">
              Authorized Signatory Attestation
            </h4>
            <p className="text-xs text-[#94A3B8] leading-relaxed">
              I certify that this System Security Plan accurately represents the security controls
              implemented, planned, or inherited for the described information system. This SSP
              constitutes the official security authorization documentation for the MacTech CUI
              Vault boundary. I understand this document may be reviewed by the cognizant
              Authorizing Official, DCSA, or other DoD oversight bodies.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-mono text-[#6B7280] uppercase tracking-wider mb-1">
                  Full Legal Name *
                </label>
                <input
                  type="text"
                  value={sigName}
                  onChange={(e) => setSigName(e.target.value)}
                  className="w-full bg-[#0D1117] border border-[#1E2D3D] text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#0EA5E9]"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-[#6B7280] uppercase tracking-wider mb-1">
                  Title / Role *
                </label>
                <input
                  type="text"
                  value={sigTitle}
                  onChange={(e) => setSigTitle(e.target.value)}
                  className="w-full bg-[#0D1117] border border-[#1E2D3D] text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#0EA5E9]"
                />
              </div>
            </div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={attested}
                onChange={(e) => setAttested(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#0EA5E9] cursor-pointer flex-shrink-0"
              />
              <span className="text-sm text-[#94A3B8] leading-relaxed">
                I am authorized to sign this SSP on behalf of my organization and certify the
                accuracy of all information contained herein.
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
            onClick={handleSign}
            disabled={!attested || sigName.trim().length < 3 || sigTitle.trim().length < 3 || submitting}
            className={`w-full py-3 text-sm font-mono font-bold uppercase tracking-widest transition-colors ${
              attested && sigName.trim().length >= 3 && sigTitle.trim().length >= 3 && !submitting
                ? "bg-[#0EA5E9] text-black hover:bg-[#38BDF8] cursor-pointer"
                : "bg-[#1E2D3D] text-[#4B5563] cursor-not-allowed"
            }`}
          >
            {submitting ? "RECORDING SIGNATURE..." : "SIGN & FINALIZE SSP"}
          </button>
        </div>
      )}
    </div>
  );
}
