"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ArrowRight, ArrowLeft } from "lucide-react";
import { BoundaryProfileSelector } from "./BoundaryProfileSelector";

export type OnboardingStep = "welcome" | "profile" | "boundary" | "inherited" | "complete";

interface OnboardingData {
  organizationName: string;
  organizationType: string;
  cmmcTargetLevel: string;
  selectedTechnologies: string[];
  inheritedSummary: string;
  inheritedCount: number;
  inheritedControlIds: string[];
  cuiBoundary: string;
  systemScope: string;
  teamMembers: string[];
}

const STEPS: OnboardingStep[] = ["welcome", "profile", "boundary", "inherited", "complete"];

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [data, setData] = useState<OnboardingData>({
    organizationName: "",
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

  const stepIndex = STEPS.indexOf(step);

  useEffect(() => {
    if (step !== "inherited" || data.selectedTechnologies.length === 0) return;
    fetch("/api/onboarding/inherited-controls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectedTechnologies: data.selectedTechnologies }),
    })
      .then((r) => (r.ok ? r.json() : { controls: [], summary: "", count: 0 }))
      .then((res) =>
        setData((prev) => ({
          ...prev,
          inheritedSummary: res.summary ?? "",
          inheritedCount: res.count ?? res.controls?.length ?? 0,
          inheritedControlIds: (res.controls ?? []).map((c: { controlId: string }) => c.controlId),
        }))
      );
  }, [step, data.selectedTechnologies.join(",")]);

  function goNext() {
    const i = stepIndex + 1;
    if (i < STEPS.length) setStep(STEPS[i]!);
  }

  function goBack() {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1]!);
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
      if (res.ok) router.push("/dashboard/governance-wizard");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-zinc-100 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white shadow-xl">
        {/* Progress */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-medium ${
                  stepIndex >= i
                    ? "border-[#3B82F6] bg-[#3B82F6] text-white"
                    : "border-zinc-300 bg-white text-zinc-400"
                }`}
              >
                {stepIndex > i ? <CheckCircle2 className="h-5 w-5" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`mx-1 h-1 w-8 sm:mx-2 sm:w-12 ${
                    stepIndex > i ? "bg-[#3B82F6]" : "bg-zinc-200"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-8">
          {step === "welcome" && (
            <div className="space-y-6 text-center">
              <h1 className="text-2xl font-bold text-zinc-900">Welcome to CMMC OS</h1>
              <p className="text-zinc-600">
                Set up your organization and compliance workspace in a few steps.
              </p>
              <button
                type="button"
                onClick={goNext}
                className="rounded-lg bg-[#3B82F6] px-6 py-3 text-sm font-medium text-white hover:bg-[#2563EB]"
              >
                Get Started
              </button>
            </div>
          )}

          {step === "profile" && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-zinc-900">Organization profile</h2>
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700">
                  Organization name
                </label>
                <input
                  type="text"
                  value={data.organizationName}
                  onChange={(e) => setData({ ...data, organizationName: e.target.value })}
                  placeholder="Acme Corp"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700">
                  Organization type
                </label>
                <select
                  value={data.organizationType}
                  onChange={(e) => setData({ ...data, organizationType: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
                >
                  <option value="">Select type...</option>
                  <option value="prime">Prime Contractor</option>
                  <option value="sub">Subcontractor</option>
                  <option value="both">Both Prime and Sub</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700">
                  CMMC target level
                </label>
                <select
                  value={data.cmmcTargetLevel}
                  onChange={(e) => setData({ ...data, cmmcTargetLevel: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
                >
                  <option value="">Select level...</option>
                  <option value="Level1">Level 1 — Basic</option>
                  <option value="Level2">Level 2 — Intermediate</option>
                  <option value="Level3">Level 3 — Advanced</option>
                </select>
              </div>
            </div>
          )}

          {step === "boundary" && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-zinc-900">Technology boundary profile</h2>
              <BoundaryProfileSelector
                selectedTechnologies={data.selectedTechnologies}
                onChange={(selected) => setData({ ...data, selectedTechnologies: selected })}
              />
            </div>
          )}

          {step === "inherited" && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-zinc-900">Inherited controls</h2>
              <p className="text-sm text-zinc-600">
                {data.inheritedSummary || "Calculating…"}
              </p>
              {data.inheritedCount > 0 && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                  <p className="font-medium text-green-800">
                    Congratulations! By selecting your cloud and identity technologies, you have inherited{" "}
                    {data.inheritedCount} control{data.inheritedCount !== 1 ? "s" : ""}.
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
              {data.inheritedCount === 0 && data.selectedTechnologies.length > 0 && (
                <p className="text-sm text-zinc-500">
                  No inherited controls for the selected technologies. You will implement all controls in the wizard.
                </p>
              )}
            </div>
          )}

          {step === "complete" && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-zinc-900">CUI boundary & complete setup</h2>
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700">
                  CUI boundary description
                </label>
                <textarea
                  value={data.cuiBoundary}
                  onChange={(e) => setData({ ...data, cuiBoundary: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
                  placeholder="Describe the boundary of your CUI environment..."
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700">
                  System scope
                </label>
                <textarea
                  value={data.systemScope}
                  onChange={(e) => setData({ ...data, systemScope: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
                  placeholder="Describe the scope of systems covered by CMMC..."
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-700">
                  Team members (optional)
                </label>
                <textarea
                  value={data.teamMembers.join("\n")}
                  onChange={(e) =>
                    setData({
                      ...data,
                      teamMembers: e.target.value.split("\n").filter((s) => s.trim()),
                    })
                  }
                  rows={2}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
                  placeholder="One email per line..."
                />
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm text-emerald-800">
                  Click &quot;Complete Setup&quot; to create all 110 control records, mark inherited controls, and open the Compliance Wizard.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between border-t border-zinc-200 px-6 py-4">
          <button
            type="button"
            onClick={goBack}
            disabled={step === "welcome"}
            className="flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            <ArrowLeft className="h-4 w-4" /> Previous
          </button>
          {step !== "complete" ? (
            <button
              type="button"
              onClick={goNext}
              className="flex items-center gap-2 rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-medium text-white hover:bg-[#2563EB]"
            >
              Next <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleComplete}
              disabled={submitting}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? "Setting up…" : "Complete Setup"}{" "}
              <CheckCircle2 className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
