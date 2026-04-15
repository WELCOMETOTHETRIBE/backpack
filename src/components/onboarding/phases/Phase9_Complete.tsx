"use client";

import { useMemo } from "react";

interface Phase9Props {
  phaseData: Record<string, unknown>;
  onComplete: (data: Record<string, unknown>) => void;
}

function scoreColor(score: number) {
  if (score >= 80) return "text-[#10B981]";
  if (score >= 50) return "text-[#F59E0B]";
  return "text-[#EF4444]";
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function Phase9_Complete({ phaseData, onComplete }: Phase9Props) {
  const p0 = phaseData["0"] as Record<string, unknown> | undefined;
  const p1 = phaseData["1"] as Record<string, unknown> | undefined;
  const p7 = phaseData["7"] as Record<string, unknown> | undefined;
  const p8 = phaseData["8"] as Record<string, unknown> | undefined;

  const sprsScore = (p7?.sprsScore as number) ?? 0;
  const poamCount = (p7?.poamCount as number) ?? 0;
  const sspDocumentId = p8?.sspDocumentId as string | undefined;
  const sspSha256 = p8?.sspSha256 as string | undefined;
  const orgName = (p1?.organizationName as string) ?? "Your Organization";
  const cageCode = p0?.cageCode as string | undefined;

  const monitoringSchedule = useMemo(() => [
    { label: "Initial Assessment Complete", date: "Today", status: "done" },
    { label: "30-Day Control Verification", date: addDays(30), status: "upcoming" },
    { label: "90-Day Vulnerability Scan Review", date: addDays(90), status: "upcoming" },
    { label: "180-Day POA&M Progress Review", date: addDays(180), status: "upcoming" },
    { label: "Annual SPRS Re-Assessment", date: addDays(365), status: "upcoming" },
  ], []);

  function handleGoToDashboard() {
    onComplete({ onboardingCompleted: true });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Success banner */}
      <div className="border border-[#10B981] bg-[#10B981]/5 p-6 flex flex-col items-center gap-3 text-center">
        <div className="w-16 h-16 border-2 border-[#10B981] flex items-center justify-center">
          <span className="text-[#10B981] text-3xl font-mono">✓</span>
        </div>
        <h3 className="text-lg font-mono font-bold text-white uppercase tracking-wider">
          Vault Onboarding Complete
        </h3>
        <p className="text-xs font-mono text-[#94A3B8]">
          {orgName} has completed the MacTech CUI Vault Trust Codex onboarding process.
          Your CMMC Level 2 readiness baseline has been established.
        </p>
        {cageCode && (
          <span className="text-xs font-mono text-[#6B7280] border border-[#1E2D3D] px-2 py-0.5">
            CAGE: {cageCode}
          </span>
        )}
      </div>

      {/* Score summary */}
      <div className="border border-[#1E2D3D] p-4 grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-xs font-mono text-[#6B7280] uppercase mb-1">Final SPRS Score</p>
          <p className={`text-4xl font-mono font-bold ${scoreColor(sprsScore)}`}>{sprsScore}</p>
          <p className="text-xs font-mono text-[#4B5563] mt-0.5">/ 110 max</p>
        </div>
        <div className="border-x border-[#1E2D3D]">
          <p className="text-xs font-mono text-[#6B7280] uppercase mb-1">Controls Adjudicated</p>
          <p className="text-4xl font-mono font-bold text-white">110</p>
          <p className="text-xs font-mono text-[#4B5563] mt-0.5">/ 110 total</p>
        </div>
        <div>
          <p className="text-xs font-mono text-[#6B7280] uppercase mb-1">Open POA&M Items</p>
          <p className={`text-4xl font-mono font-bold ${poamCount > 0 ? "text-[#F59E0B]" : "text-[#10B981]"}`}>
            {poamCount}
          </p>
          <p className="text-xs font-mono text-[#4B5563] mt-0.5">items</p>
        </div>
      </div>

      {/* SSP record */}
      {sspDocumentId && (
        <div className="border border-[#1E2D3D] p-4 flex flex-col gap-2">
          <p className="text-xs font-mono text-[#6B7280] uppercase tracking-wider">SSP Record</p>
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-[#6B7280]">Document ID</span>
            <span className="text-white">{sspDocumentId}</span>
          </div>
          {sspSha256 && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[#6B7280] text-xs font-mono">SHA-256 Hash</span>
              <span className="text-[#0EA5E9] text-xs font-mono break-all bg-[#0D1117] p-2 border border-[#1E2D3D]">
                {sspSha256}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Vault access */}
      <div className="border border-[#8B5CF6]/30 bg-[#8B5CF6]/5 p-4 flex flex-col gap-3">
        <h4 className="text-xs font-mono text-[#8B5CF6] uppercase tracking-widest font-bold">
          Vault Access Instructions
        </h4>
        {[
          {
            step: "01",
            title: "RDP Endpoint",
            detail: "Your Vault VM endpoint will be provisioned within 1 business day. Check your onboarding email for the Azure Bastion connection details.",
          },
          {
            step: "02",
            title: "MFA Enrollment",
            detail: "Enroll in Microsoft Authenticator via the MyApps portal before your first login. All privileged access requires MFA.",
          },
          {
            step: "03",
            title: "CUI Folder Structure",
            detail: "CUI must be stored in the designated Z:\\CUI\\ share. Do not store CUI on the local C:\\ drive. The share is encrypted at rest via BitLocker.",
          },
          {
            step: "04",
            title: "Incident Reporting",
            detail: "Report any suspected CUI incidents within 72 hours to your MacTech ISSO. Use the Incident form in the Control Plane dashboard.",
          },
        ].map((item) => (
          <div key={item.step} className="flex items-start gap-3">
            <span className="text-xs font-mono text-[#8B5CF6] font-bold w-6 flex-shrink-0 mt-0.5">
              {item.step}
            </span>
            <div>
              <p className="text-sm font-mono text-white">{item.title}</p>
              <p className="text-xs text-[#94A3B8] mt-0.5">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Continuous monitoring schedule */}
      <div className="border border-[#1E2D3D]">
        <div className="p-3 border-b border-[#1E2D3D]">
          <h4 className="text-xs font-mono text-[#94A3B8] uppercase tracking-widest">
            Continuous Monitoring Schedule
          </h4>
        </div>
        <div className="divide-y divide-[#1E2D3D]">
          {monitoringSchedule.map((item) => (
            <div key={item.label} className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span
                  className={`w-2 h-2 flex-shrink-0 ${
                    item.status === "done" ? "bg-[#10B981]" : "bg-[#374151]"
                  }`}
                />
                <span className="text-xs font-mono text-white">{item.label}</span>
              </div>
              <span
                className={`text-xs font-mono ${
                  item.status === "done" ? "text-[#10B981]" : "text-[#6B7280]"
                }`}
              >
                {item.date}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleGoToDashboard}
          className="w-full py-3 text-sm font-mono font-bold uppercase tracking-widest bg-[#10B981] text-black hover:bg-[#34D399] transition-colors cursor-pointer"
        >
          ENTER CONTROL PLANE DASHBOARD →
        </button>
        <p className="text-xs font-mono text-[#6B7280] text-center">
          Your onboarding record has been saved. You can download your onboarding package from
          the Compliance section of the dashboard.
        </p>
      </div>
    </div>
  );
}
