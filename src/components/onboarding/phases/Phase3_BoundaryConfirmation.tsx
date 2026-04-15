"use client";

import { useState } from "react";
import { CLOUD_ONLY_AZURE_PRESET } from "@/lib/compliance/scoping-presets";
import { VAULT_CONTROL_MAP } from "@/data/vault-control-map";

interface Phase3Props {
  onComplete: (data: Record<string, unknown>) => void;
}

export function Phase3_BoundaryConfirmation({ onComplete }: Phase3Props) {
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function handleConfirm() {
    if (!confirmed) return;
    setSubmitting(true);
    setError(null);

    try {
      // Auto-write the 10 N/A adjudications to DB
      const naAdjudications = CLOUD_ONLY_AZURE_PRESET.controls.map((ctrl) => {
        const vaultCtrl = VAULT_CONTROL_MAP.find((c) => c.controlId === ctrl.controlId);
        return {
          controlId: ctrl.controlId,
          tier: "not_applicable",
          status: "not_applicable",
          narrative: ctrl.reason,
          needsReview: false,
        };
      });

      const res = await fetch("/api/onboarding/adjudicate-controls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adjudications: naAdjudications }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to record N/A controls");
      }

      onComplete({
        boundaryConfirmed: true,
        scopeComponents: ["windows_server_vm", "azure_cloud"],
        naControlsWritten: CLOUD_ONLY_AZURE_PRESET.controls.map((c) => c.controlId),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Boundary statement */}
      <div className="border border-[#0EA5E9]/30 bg-[#0EA5E9]/5 p-4">
        <h3 className="text-xs font-mono font-bold text-[#0EA5E9] uppercase tracking-widest mb-3">
          Authorization Boundary (Read-Only for Pilot)
        </h3>
        <div className="flex flex-col gap-2">
          <BoundaryComponent
            label="Compute"
            value="Windows Server 2025 Datacenter VM"
            detail="Single VM — STIG-hardened by MacTech Solutions LLC"
          />
          <BoundaryComponent
            label="Cloud Platform"
            value="Microsoft Azure Government"
            detail="FedRAMP High Authorized — East US Government Region"
          />
          <BoundaryComponent
            label="Identity"
            value="Microsoft Entra ID"
            detail="MFA enforced for all privileged access"
          />
          <BoundaryComponent
            label="Logging"
            value="Azure Monitor + Log Analytics + Sentinel"
            detail="Centralized SIEM with 90-day retention baseline"
          />
          <BoundaryComponent
            label="Endpoint Protection"
            value="Microsoft Defender for Endpoint"
            detail="Real-time AV, EDR, cloud-delivered protection"
          />
        </div>
      </div>

      {/* Auto-applied N/A controls */}
      <div className="border border-[#1E2D3D]">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between p-3 text-left hover:bg-[#1E2D3D]/30 transition-colors"
        >
          <span className="text-xs font-mono text-[#94A3B8] uppercase tracking-wider">
            Auto-Applied N/A Controls (
            {CLOUD_ONLY_AZURE_PRESET.controls.length} controls)
          </span>
          <span className="text-[#6B7280] font-mono text-xs">
            {expanded ? "▲ HIDE" : "▼ SHOW"}
          </span>
        </button>
        {expanded && (
          <div className="border-t border-[#1E2D3D] divide-y divide-[#1E2D3D]">
            {CLOUD_ONLY_AZURE_PRESET.controls.map((ctrl) => (
              <div key={ctrl.controlId} className="p-3 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-[#F59E0B] bg-[#F59E0B]/10 px-2 py-0.5 border border-[#F59E0B]/30">
                    N/A
                  </span>
                  <span className="text-xs font-mono text-white">{ctrl.controlId}</span>
                  <span className="text-xs text-[#94A3B8]">{ctrl.title}</span>
                </div>
                <p className="text-xs text-[#6B7280] pl-[52px]">{ctrl.reason}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-[#0EA5E9] cursor-pointer"
        />
        <span className="text-sm text-[#94A3B8] leading-relaxed">
          I confirm that the single Windows Server VM on Microsoft Azure Government
          described above is the{" "}
          <strong className="text-white">complete boundary</strong> for my
          organization's CUI processing under this Vault agreement.
        </span>
      </label>

      {error && (
        <div className="border border-[#EF4444] bg-[#7F1D1D]/20 text-[#EF4444] text-sm font-mono px-3 py-2">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleConfirm}
        disabled={!confirmed || submitting}
        className={`w-full py-3 text-sm font-mono font-bold uppercase tracking-widest transition-colors ${
          confirmed && !submitting
            ? "bg-[#0EA5E9] text-black hover:bg-[#38BDF8] cursor-pointer"
            : "bg-[#1E2D3D] text-[#4B5563] cursor-not-allowed"
        }`}
      >
        {submitting
          ? "RECORDING N/A CONTROLS..."
          : "CONFIRM BOUNDARY & CONTINUE"}
      </button>
    </div>
  );
}

function BoundaryComponent({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs font-mono text-[#6B7280] w-28 flex-shrink-0 uppercase pt-0.5">
        {label}
      </span>
      <div>
        <span className="text-sm font-mono text-white">{value}</span>
        <p className="text-xs text-[#6B7280] mt-0.5">{detail}</p>
      </div>
    </div>
  );
}
