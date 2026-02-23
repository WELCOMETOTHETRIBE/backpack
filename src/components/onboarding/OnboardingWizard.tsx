"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ArrowRight, ArrowLeft, Wand2, Check, ChevronDown, ChevronUp, Info } from "lucide-react";
import { BoundaryScopingInterview } from "./BoundaryScopingInterview";
import { BoundaryDiagram } from "./BoundaryDiagram";
import { CONTROL_FAMILIES } from "@/components/governance-wizard/constants";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";

const STEP_LABELS: Record<OnboardingStep, string> = {
  welcome: "Welcome",
  org: "Your Organization",
  boundary: "Your CUI Boundary",
  diagram: "Your Boundary Diagram",
  inherited: "Inherited Controls",
  checklist: "Your Compliance Checklist",
};

export type OnboardingStep = "welcome" | "org" | "boundary" | "diagram" | "inherited" | "checklist";

interface OnboardingData {
  organizationName: string;
  cageCode: string;
  primaryAddress: string;
  primaryContactName: string;
  primaryContactEmail: string;
  organizationType: string;
  cmmcTargetLevel: string;
  selectedTechnologies: string[];
  inheritedSummary: string;
  inheritedCount: number;
  inheritedControls: { controlId: string; inheritedFrom: string }[];
  cuiBoundary: string;
  systemScope: string;
  teamMembers: string[];
}

const STEPS: OnboardingStep[] = ["welcome", "org", "boundary", "diagram", "inherited", "checklist"];

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [data, setData] = useState<OnboardingData>({
    organizationName: "",
    cageCode: "",
    primaryAddress: "",
    primaryContactName: "",
    primaryContactEmail: "",
    organizationType: "",
    cmmcTargetLevel: "",
    selectedTechnologies: [],
    inheritedSummary: "",
    inheritedCount: 0,
    inheritedControls: [],
    cuiBoundary: "",
    systemScope: "",
    teamMembers: [],
  });
  const [nistTitles, setNistTitles] = useState<Record<string, string>>({});
  const [expandedInherited, setExpandedInherited] = useState(false);
  const [loadingOrg, setLoadingOrg] = useState(false);
  const [savingOrg, setSavingOrg] = useState(false);
  const [augmenting, setAugmenting] = useState<"cuiBoundary" | "systemScope" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const stepIndex = STEPS.indexOf(step);
  const currentStepNumber = stepIndex + 1;

  // Fetch org profile for Step 2
  useEffect(() => {
    if (step !== "org") return;
    setLoadingOrg(true);
    fetch("/api/organizations")
      .then((r) => (r.ok ? r.json() : null))
      .then((org) => {
        if (org) {
          setData((prev) => ({
            ...prev,
            organizationName: org.name ?? prev.organizationName,
            cageCode: org.cageCode ?? prev.cageCode,
            primaryAddress: org.primaryAddress ?? prev.primaryAddress,
            primaryContactName: org.primaryContactName ?? prev.primaryContactName,
            primaryContactEmail: org.primaryContactEmail ?? prev.primaryContactEmail,
            organizationType: org.organizationType ?? prev.organizationType,
            cmmcTargetLevel: org.cmmcTargetLevel ?? prev.cmmcTargetLevel,
          }));
        }
      })
      .finally(() => setLoadingOrg(false));
  }, [step]);

  // Fetch inherited controls when entering Step 4
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
          inheritedControls: res.controls ?? [],
        }))
      );
  }, [step, data.selectedTechnologies.join(",")]);

  // Fetch NIST titles for inherited list (plain-English names)
  useEffect(() => {
    if (step !== "inherited" && step !== "checklist") return;
    fetch("/api/controls/nist")
      .then((r) => (r.ok ? r.json() : []))
      .then((arr: { controlId: string; title: string | null }[]) => {
        const map: Record<string, string> = {};
        for (const row of arr) {
          if (row.controlId && row.title) map[row.controlId] = row.title;
        }
        setNistTitles(map);
      });
  }, [step]);

  const goNext = useCallback(() => {
    if (step === "org") {
      setSavingOrg(true);
      fetch("/api/organizations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.organizationName || undefined,
          cageCode: data.cageCode || undefined,
          primaryAddress: data.primaryAddress || undefined,
          primaryContactName: data.primaryContactName || undefined,
          primaryContactEmail: data.primaryContactEmail || undefined,
          organizationType: data.organizationType || undefined,
          cmmcTargetLevel: data.cmmcTargetLevel || undefined,
        }),
      })
        .then((r) => {
          if (r.ok) setStep(STEPS[STEPS.indexOf(step) + 1]!);
        })
        .finally(() => setSavingOrg(false));
      return;
    }
    const i = stepIndex + 1;
    if (i < STEPS.length) setStep(STEPS[i]!);
  }, [step, stepIndex, data.organizationName, data.cageCode, data.primaryAddress, data.primaryContactName, data.primaryContactEmail, data.organizationType, data.cmmcTargetLevel]);

  function goBack() {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1]!);
  }

  async function handleAugment(field: "cuiBoundary" | "systemScope") {
    const text = field === "cuiBoundary" ? data.cuiBoundary : data.systemScope;
    if (!text.trim()) return;
    setAugmenting(field);
    try {
      const res = await fetch("/api/onboarding/augment-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, text }),
      });
      if (res.ok) {
        const { augmented } = await res.json();
        if (augmented) setData((prev) => ({ ...prev, [field]: augmented }));
      }
    } finally {
      setAugmenting(null);
    }
  }

  async function handleStartChecklist() {
    setSubmitting(true);
    try {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const teamMembers = (data.teamMembers ?? []).filter((s) => s.trim() && emailRegex.test(s.trim()));
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationType: data.organizationType || undefined,
          cmmcTargetLevel: data.cmmcTargetLevel || undefined,
          cuiBoundary: data.cuiBoundary || undefined,
          systemScope: data.systemScope || undefined,
          teamMembers,
          selectedTechnologies: data.selectedTechnologies ?? [],
        }),
      });
      if (res.ok) {
        const firstFamily = CONTROL_FAMILIES[0];
        const familyCode = firstFamily?.code ?? "AC";
        router.push(`/dashboard/governance-wizard?family=${familyCode}&skipIntro=1`);
        return;
      }
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col">
        {/* Persistent header */}
        <div className="shrink-0 border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">CMMC Onboarding</span>
            <span className="text-sm font-medium text-gray-700">
              Step {currentStepNumber} of 6: {STEP_LABELS[step]}
            </span>
          </div>
          <div className="mt-3 flex gap-1" role="progressbar" aria-valuenow={currentStepNumber} aria-valuemin={1} aria-valuemax={6} aria-label="Progress">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <span
                key={i}
                className={`h-2 flex-1 rounded-full transition-all duration-200 ${
                  i <= currentStepNumber ? "bg-blue-600" : "bg-gray-200"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
          {/* Step 1: Welcome */}
          {step === "welcome" && (
            <div className="space-y-6 text-center">
              <h1 className="text-2xl font-bold text-gray-900">Let&apos;s get you CMMC ready.</h1>
              <p className="text-gray-600">
                CMMC (Cybersecurity Maturity Model Certification) is a requirement for companies that handle sensitive government information. This wizard will walk you through everything you need to do — step by step, in plain English. Most companies complete this in about 45 minutes. You can save your progress and come back at any time.
              </p>
              <button
                type="button"
                onClick={goNext}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-all duration-200"
                aria-label="Start onboarding"
              >
                Let&apos;s start <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Step 2: Your Organization */}
          {step === "org" && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Tell us about your company.</h2>
              {loadingOrg && (
                <p className="text-sm text-gray-500">Loading your organization…</p>
              )}
              <div className={`space-y-4 ${loadingOrg ? "opacity-70" : ""}`}>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Company legal name</label>
                  <input
                    type="text"
                    value={data.organizationName}
                    onChange={(e) => setData((p) => ({ ...p, organizationName: e.target.value }))}
                    placeholder="Acme Corp"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    aria-label="Company legal name"
                  />
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-700">
                    CAGE Code
                    <span className="group relative">
                      <Info className="h-4 w-4 text-gray-400" aria-hidden />
                      <span className="absolute left-0 top-full z-10 mt-1 hidden w-64 rounded bg-gray-800 px-2 py-1.5 text-xs text-white group-hover:block">
                        Your CAGE Code is a 5-character identifier assigned by the government. You can find it on your contract or at sam.gov.
                      </span>
                    </span>
                  </label>
                  <input
                    type="text"
                    value={data.cageCode}
                    onChange={(e) => setData((p) => ({ ...p, cageCode: e.target.value.slice(0, 10) }))}
                    placeholder="1AB2C"
                    maxLength={10}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    aria-label="CAGE Code"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Primary address</label>
                  <textarea
                    value={data.primaryAddress}
                    onChange={(e) => setData((p) => ({ ...p, primaryAddress: e.target.value }))}
                    placeholder="123 Main St, City, State ZIP"
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    aria-label="Primary address"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Primary point of contact (name)</label>
                    <input
                      type="text"
                      value={data.primaryContactName}
                      onChange={(e) => setData((p) => ({ ...p, primaryContactName: e.target.value }))}
                      placeholder="Jane Smith"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      aria-label="Primary contact name"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Primary point of contact (email)</label>
                    <input
                      type="email"
                      value={data.primaryContactEmail}
                      onChange={(e) => setData((p) => ({ ...p, primaryContactEmail: e.target.value }))}
                      placeholder="jane@company.com"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      aria-label="Primary contact email"
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Organization type</label>
                    <select
                      value={data.organizationType}
                      onChange={(e) => setData((p) => ({ ...p, organizationType: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      aria-label="Organization type"
                    >
                      <option value="">Select type…</option>
                      <option value="prime">Prime Contractor</option>
                      <option value="sub">Subcontractor</option>
                      <option value="both">Both Prime and Sub</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">CMMC target level</label>
                    <select
                      value={data.cmmcTargetLevel}
                      onChange={(e) => setData((p) => ({ ...p, cmmcTargetLevel: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      aria-label="CMMC target level"
                    >
                      <option value="">Select level…</option>
                      <option value="Level1">Level 1 — Basic</option>
                      <option value="Level2">Level 2 — Intermediate</option>
                      <option value="Level3">Level 3 — Advanced</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: CUI Boundary — scoping interview */}
          {step === "boundary" && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">What&apos;s inside your CUI environment?</h2>
              <BoundaryScopingInterview
                onComplete={(selectedTechnologies) => {
                  setData((p) => ({ ...p, selectedTechnologies }));
                  setStep("diagram");
                }}
              />
            </div>
          )}

          {/* Step 4: Boundary diagram */}
          {step === "diagram" && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Here is what your CUI boundary looks like based on your answers.
              </h2>
              <BoundaryDiagram />
              <div className="space-y-4 border-t border-gray-200 pt-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Describe your CUI boundary — where does government information live?
                  </label>
                  <div className="flex gap-2">
                    <textarea
                      value={data.cuiBoundary}
                      onChange={(e) => setData((p) => ({ ...p, cuiBoundary: e.target.value }))}
                      rows={2}
                      placeholder="e.g. Azure Gov, on-prem servers..."
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      aria-label="CUI boundary description"
                    />
                    <button
                      type="button"
                      onClick={() => handleAugment("cuiBoundary")}
                      disabled={!data.cuiBoundary.trim() || augmenting !== null}
                      className="shrink-0 rounded-lg border border-gray-300 bg-white p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      aria-label="Expand with AI"
                    >
                      <Wand2 className="h-5 w-5" />
                    </button>
                  </div>
                  {augmenting === "cuiBoundary" && <p className="mt-1 text-xs text-gray-500">Expanding…</p>}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Describe the scope of your CMMC assessment — what systems are included?
                  </label>
                  <div className="flex gap-2">
                    <textarea
                      value={data.systemScope}
                      onChange={(e) => setData((p) => ({ ...p, systemScope: e.target.value }))}
                      rows={2}
                      placeholder="e.g. all systems processing CUI..."
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      aria-label="Assessment scope"
                    />
                    <button
                      type="button"
                      onClick={() => handleAugment("systemScope")}
                      disabled={!data.systemScope.trim() || augmenting !== null}
                      className="shrink-0 rounded-lg border border-gray-300 bg-white p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      aria-label="Expand with AI"
                    >
                      <Wand2 className="h-5 w-5" />
                    </button>
                  </div>
                  {augmenting === "systemScope" && <p className="mt-1 text-xs text-gray-500">Expanding…</p>}
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Inherited Controls */}
          {step === "inherited" && (
            <div className="space-y-6">
              {data.inheritedCount > 0 ? (
                <>
                  <h2 className="text-xl font-semibold text-gray-900">
                    Great news — you&apos;ve already inherited {data.inheritedCount} controls.
                  </h2>
                  <p className="text-sm text-gray-600">
                    Because you selected cloud or identity technologies, {data.inheritedCount} of the 110 CMMC controls are automatically satisfied by your technology provider&apos;s own compliance certifications. We&apos;ve marked these as &quot;Inherited&quot; in your compliance program. You don&apos;t need to do anything for these.
                  </p>
                  <div className="flex items-center gap-4">
                    <span className="text-4xl font-bold text-green-600" aria-hidden>{data.inheritedCount}</span>
                    <span className="text-sm text-gray-600">controls inherited</span>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => setExpandedInherited((b) => !b)}
                      className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                      aria-expanded={expandedInherited}
                    >
                      {expandedInherited ? "Hide inherited controls" : "Show all inherited controls"}
                      {expandedInherited ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {expandedInherited && (
                      <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 text-sm">
                        {data.inheritedControls.map((c) => (
                          <li key={c.controlId} className="flex flex-wrap gap-x-2 gap-y-0">
                            <span className="font-medium text-gray-900">{c.controlId}</span>
                            <span className="text-gray-600">{nistTitles[c.controlId] ?? c.controlId}</span>
                            <span className="text-gray-500">— {c.inheritedFrom}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-semibold text-gray-900">Inherited controls</h2>
                  <p className="text-sm text-gray-600">
                    Your selected technologies don&apos;t include any pre-certified cloud providers, so you&apos;ll implement all controls yourself. That&apos;s completely normal — let&apos;s get started.
                  </p>
                </>
              )}
            </div>
          )}

          {/* Step 5: Meet Your Compliance Checklist */}
          {step === "checklist" && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Here&apos;s your personalized CMMC checklist.</h2>
              <p className="text-sm text-gray-600">
                Based on your environment, you have 110 controls to implement. We&apos;ve organized them into 14 categories. You&apos;ll work through each one, and we&apos;ll guide you every step of the way. You can do this in any order — start with what you know best.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {CONTROL_FAMILIES.map((f) => {
                  const Icon = f.icon;
                  const count = ALL_CONTROL_IDS.filter((id) => id.startsWith(f.controlPrefix)).length;
                  return (
                    <div
                      key={f.code}
                      className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4"
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600">
                        <Icon className="h-6 w-6" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900">{f.plainName}</p>
                        <p className="text-xs text-gray-500">{count} controls</p>
                      </div>
                      <div className="relative h-10 w-10 shrink-0" aria-hidden>
                        <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36">
                          <path
                            fill="none"
                            stroke="#e5e7eb"
                            strokeWidth="3"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          />
                          <path
                            fill="none"
                            stroke="#3b82f6"
                            strokeWidth="3"
                            strokeDasharray="0, 100"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          />
                        </svg>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={handleStartChecklist}
                disabled={submitting}
                className="w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-all duration-200 flex items-center justify-center gap-2"
                aria-label="Start with first family"
              >
                {submitting ? "Setting up…" : `Start with ${CONTROL_FAMILIES[0]?.plainName ?? "your checklist"} `}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <div className="shrink-0 flex justify-between border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={goBack}
            disabled={step === "welcome"}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            aria-label="Previous step"
          >
            <ArrowLeft className="h-4 w-4" /> Previous
          </button>
          {step !== "checklist" && step !== "boundary" ? (
            <button
              type="button"
              onClick={goNext}
              disabled={step === "org" && savingOrg}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              aria-label="Next step"
            >
              {step === "org" && savingOrg ? "Saving…" : "Next"} <ArrowRight className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
