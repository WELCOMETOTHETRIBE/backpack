"use client";

import { useState } from "react";

interface Phase3Props {
  onComplete: (data: Record<string, unknown>) => void;
}

/**
 * Phase 3 — Boundary Confirmation.
 *
 * Customer affirms the single canonical CUI Vault boundary (Win Server 2025
 * VM on Azure Gov FedRAMP High). That's it. No data submission, no per-
 * control adjudication side-effects.
 *
 * Earlier versions auto-wrote 10 N/A control adjudications (wireless, alt
 * work sites, VoIP, etc.) directly to the DB during this phase, bypassing
 * the signed-attestation flow that makes those N/A claims C3PAO-defensible.
 * That's been moved to the Outstanding Controls Wizard's Bucket E, where
 * each N/A attestation is a SHA-256-bound signed artifact. Onboarding stays
 * thin: confirm the architecture, then everything per-control happens in the
 * dashboard wizard.
 */
export function Phase3_BoundaryConfirmation({ onComplete }: Phase3Props) {
  const [confirmed, setConfirmed] = useState(false);

  function handleConfirm() {
    if (!confirmed) return;
    onComplete({
      boundaryConfirmed: true,
      scopeComponents: ["windows_server_vm", "azure_cloud"],
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Boundary statement */}
      <div className="border border-[#0EA5E9]/30 bg-[#0EA5E9]/5 p-4">
        <h3 className="text-xs font-mono font-bold text-[#0EA5E9] uppercase tracking-widest mb-3">
          Authorization Boundary (Fixed Architecture)
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

      {/* Note: per-control adjudication (inherited, N/A, register entries,
          signed attestations) happens after onboarding via the Outstanding
          Controls Wizard at /dashboard/readiness/outstanding. Onboarding
          captures the boundary; adjudication is its own workflow. */}
      <div className="border border-[#1E2D3D] bg-[#0A1218] p-3">
        <p className="text-xs text-[#94A3B8] leading-relaxed">
          <span className="text-[#0EA5E9] font-semibold">Next:</span> after
          this step, you&apos;ll land on the dashboard. Inherited controls (Azure
          FedRAMP), N/A attestations (no wireless, no alt work sites, etc.),
          register entries, and attestation sign-offs all live in the{" "}
          <span className="text-white font-mono">Outstanding Controls Wizard</span>{" "}
          there. Each is a discrete, signed action — not pre-applied.
        </p>
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
          organization&apos;s CUI processing under this Vault agreement.
        </span>
      </label>

      <button
        type="button"
        onClick={handleConfirm}
        disabled={!confirmed}
        className={`w-full py-3 text-sm font-mono font-bold uppercase tracking-widest transition-colors ${
          confirmed
            ? "bg-[#0EA5E9] text-black hover:bg-[#38BDF8] cursor-pointer"
            : "bg-[#1E2D3D] text-[#4B5563] cursor-not-allowed"
        }`}
      >
        Confirm boundary &amp; continue
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
