"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ArrowRight, ArrowLeft, Check } from "lucide-react";

const BOUNDARY_CATEGORIES: { label: string; options: { value: string; label: string }[] }[] = [
  { label: "Operating systems", options: [
    { value: "windows_server", label: "Windows Server 2019 / 2022 / 2025" },
    { value: "rhel", label: "Red Hat Enterprise Linux 8/9 (CentOS/Rocky/Alma)" },
    { value: "macos", label: "macOS 13+ (Ventura/Sonoma) managed via MDM" },
  ]},
  { label: "Cloud platform", options: [
    { value: "azure_gov", label: "Microsoft Azure Government (FedRAMP High)" },
    { value: "aws_govcloud", label: "AWS GovCloud (US)" },
  ]},
  { label: "Identity provider", options: [
    { value: "entra_id", label: "Microsoft Entra ID (Azure AD)" },
    { value: "okta", label: "Okta Identity Platform" },
  ]},
  { label: "Endpoint management", options: [
    { value: "intune", label: "Microsoft Intune (Endpoint Manager)" },
    { value: "jamf", label: "JAMF Pro (macOS/iOS MDM)" },
  ]},
  { label: "Security & monitoring", options: [
    { value: "defender", label: "Microsoft Defender for Endpoint / Defender for Cloud" },
    { value: "crowdstrike", label: "CrowdStrike Falcon" },
    { value: "splunk", label: "Splunk Enterprise / Splunk Cloud" },
    { value: "tenable", label: "Tenable.io / Tenable.sc (Nessus)" },
    { value: "palo_alto", label: "Palo Alto NGFW / Prisma" },
    { value: "cisco_asa", label: "Cisco ASA / Firepower" },
  ]},
];

type Step = 1 | 2 | 3 | 4;

interface OnboardingData {
  organizationType: string;
  cmmcTargetLevel: string;
  organizationName?: string;
  selectedTechnologies: string[];
  inheritedSummary: string;
  inheritedCount: number;
  inheritedControlIds: string[];
  cuiBoundary: string;
  systemScope: string;
  teamMembers: string[];
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [data, setData] = useState<OnboardingData>({
    organizationType: "",
    cmmcTargetLevel: "",
    selectedTechnologies: [],
    inheritedSummary: "",
    inheritedCount: 0,
    inheritedControlIds: [],
    cuiBoundary: "",
    systemScope: "",
    teamMembers: [],
  });
  const [submitting, setSubmitting] = useState(false);

  // When moving to step 3, fetch inherited controls
  useEffect(() => {
    if (step !== 3 || data.selectedTechnologies.length === 0) return;
    fetch("/api/onboarding/inherited-controls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectedTechnologies: data.selectedTechnologies }),
    })
      .then((r) => r.ok ? r.json() : { controls: [], summary: "", count: 0 })
      .then((res) =>
        setData((prev) => ({
          ...prev,
          inheritedSummary: res.summary ?? "",
          inheritedCount: res.count ?? res.controls?.length ?? 0,
          inheritedControlIds: (res.controls ?? []).map((c: { controlId: string }) => c.controlId),
        }))
      );
  }, [step, data.selectedTechnologies]);

  function toggleTech(value: string) {
    setData((prev) => {
      const set = new Set(prev.selectedTechnologies);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return { ...prev, selectedTechnologies: [...set] };
    });
  }

  async function handleComplete() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationType: data.organizationType,
          cmmcTargetLevel: data.cmmcTargetLevel,
          cuiBoundary: data.cuiBoundary,
          systemScope: data.systemScope,
          teamMembers: data.teamMembers,
          selectedTechnologies: data.selectedTechnologies,
        }),
      });
      if (res.ok) {
        router.push("/dashboard/governance-wizard");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const totalSteps = 4;
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#0F172A]">Welcome to CMMC OS</h1>
        <p className="mt-2 text-gray-600">Set up your organization and compliance workspace</p>
      </div>

      <div className="mb-8 flex items-center justify-between">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                step >= s ? "border-[#3B82F6] bg-[#3B82F6] text-white" : "border-gray-300 bg-white text-gray-400"
              }`}
            >
              {step > s ? <CheckCircle2 className="h-5 w-5" /> : s}
            </div>
            {s < totalSteps && <div className={`h-1 w-16 ${step > s ? "bg-[#3B82F6]" : "bg-gray-300"}`} />}
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-8">
        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-[#0F172A]">Organization & CMMC Level</h2>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Organization Type</label>
              <select
                value={data.organizationType}
                onChange={(e) => setData({ ...data, organizationType: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
              >
                <option value="">Select type...</option>
                <option value="prime">Prime Contractor</option>
                <option value="sub">Subcontractor</option>
                <option value="both">Both Prime and Sub</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">CMMC Target Level</label>
              <select
                value={data.cmmcTargetLevel}
                onChange={(e) => setData({ ...data, cmmcTargetLevel: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
              >
                <option value="">Select level...</option>
                <option value="Level1">Level 1 - Basic</option>
                <option value="Level2">Level 2 - Intermediate</option>
                <option value="Level3">Level 3 - Advanced</option>
              </select>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-[#0F172A]">Technology boundary profile</h2>
            <p className="text-sm text-gray-600">
              Select the technologies in your CUI environment. This determines which evidence requirements you will see in the compliance wizard.
            </p>
            {BOUNDARY_CATEGORIES.map((cat) => (
              <div key={cat.label}>
                <h3 className="mb-2 text-sm font-medium text-gray-700">{cat.label}</h3>
                <ul className="space-y-2">
                  {cat.options.map((opt) => (
                    <li key={opt.value}>
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={data.selectedTechnologies.includes(opt.value)}
                          onChange={() => toggleTech(opt.value)}
                          className="h-4 w-4 rounded border-gray-300 text-[#3B82F6]"
                        />
                        <span className="text-gray-900">{opt.label}</span>
                        {data.selectedTechnologies.includes(opt.value) && <Check className="h-4 w-4 text-[#3B82F6]" />}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-[#0F172A]">Inherited controls</h2>
            <p className="text-sm text-gray-600">{data.inheritedSummary || "Calculating…"}</p>
            {data.inheritedCount > 0 && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <p className="font-medium text-green-800">
                  Congratulations! Your cloud provider satisfies the following controls automatically.
                </p>
                <ul className="mt-2 max-h-48 list-inside list-disc overflow-y-auto text-sm text-green-700">
                  {data.inheritedControlIds.slice(0, 30).map((id) => (
                    <li key={id}>{id}</li>
                  ))}
                  {data.inheritedControlIds.length > 30 && (
                    <li>… and {data.inheritedControlIds.length - 30} more</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-[#0F172A]">CUI boundary & complete setup</h2>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">CUI boundary description</label>
              <textarea
                value={data.cuiBoundary}
                onChange={(e) => setData({ ...data, cuiBoundary: e.target.value })}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Describe the boundary of your CUI environment..."
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">System scope</label>
              <textarea
                value={data.systemScope}
                onChange={(e) => setData({ ...data, systemScope: e.target.value })}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Describe the scope of systems covered by CMMC..."
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Team members (optional)</label>
              <textarea
                value={data.teamMembers.join("\n")}
                onChange={(e) =>
                  setData({
                    ...data,
                    teamMembers: e.target.value.split("\n").filter((s) => s.trim()),
                  })
                }
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="One email per line..."
              />
            </div>
            <div className="rounded-lg border border-[#10B981] bg-[#10B981]/10 p-4">
              <p className="text-sm text-[#10B981]">
                Click &quot;Complete Setup&quot; to create all 110 control records, mark inherited controls, and open the Compliance Wizard.
              </p>
            </div>
          </div>
        )}

        <div className="mt-8 flex justify-between">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1) as Step)}
            disabled={step === 1}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <ArrowLeft className="h-4 w-4" /> Previous
          </button>
          {step < 4 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(4, s + 1) as Step)}
              className="flex items-center gap-2 rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-medium text-white hover:bg-[#2563EB]"
            >
              Next <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleComplete}
              disabled={submitting}
              className="flex items-center gap-2 rounded-lg bg-[#10B981] px-4 py-2 text-sm font-medium text-white hover:bg-[#059669] disabled:opacity-50"
            >
              {submitting ? "Setting up…" : "Complete Setup"} <CheckCircle2 className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
