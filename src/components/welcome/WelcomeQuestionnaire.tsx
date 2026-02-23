"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Info, Plus, X } from "lucide-react";

const STEP_1_OPTIONS = [
  { value: "office", label: "In our company office" },
  { value: "remote", label: "Remotely (from home)" },
  { value: "both", label: "Both" },
] as const;

const STEP_2_OPTIONS = [
  { value: "m365", label: "Microsoft 365 (SharePoint, OneDrive)" },
  { value: "google_workspace", label: "Google Workspace (Drive)" },
  { value: "server_office", label: "A server in our office" },
  { value: "other_cloud", label: "Other cloud storage" },
] as const;

const STEP_3_OPTIONS = [
  { value: "entra_id", label: "Microsoft accounts (Entra ID)" },
  { value: "google_workspace", label: "Google accounts" },
  { value: "on_prem_ad", label: "A server in our office (Active Directory)" },
  { value: "okta", label: "Okta" },
] as const;

const STEP_4_OPTIONS = [
  { value: "windows", label: "Windows" },
  { value: "macs", label: "Macs" },
  { value: "both", label: "Both" },
] as const;

const STEP_5_OPTIONS = [
  { value: "defender", label: "Microsoft Defender" },
  { value: "crowdstrike", label: "CrowdStrike" },
  { value: "sentinelone", label: "SentinelOne" },
  { value: "intune", label: "Microsoft Intune" },
  { value: "jamf", label: "JAMF" },
  { value: "tenable", label: "Tenable / Nessus" },
  { value: "splunk", label: "Splunk" },
] as const;

const STEP_6_OPTIONS = [
  { value: "azure_commercial", label: "Microsoft Azure" },
  { value: "azure_gov", label: "Azure Government" },
  { value: "aws", label: "Amazon Web Services (AWS)" },
  { value: "gcp", label: "Google Cloud (GCP)" },
] as const;

/** Maps environment answers to boundary profile technology keys (same as profile-from-interview API). */
function mapInterviewToKeys(answers: {
  step1?: string;
  step2?: string[];
  step3?: string[];
  step4?: string;
  step5?: string[];
  step6?: string[];
}): string[] {
  const keys: string[] = [];
  const s1 = answers.step1;
  if (s1 === "office") keys.push("on_prem_network");
  if (s1 === "remote") keys.push("remote_workforce");
  if (s1 === "both") keys.push("on_prem_network", "remote_workforce");

  const s2 = answers.step2 ?? [];
  if (s2.includes("m365")) keys.push("m365");
  if (s2.includes("google_workspace")) keys.push("google_workspace");
  if (s2.includes("server_office")) keys.push("on_prem_ad");
  if (s2.includes("other_cloud")) keys.push("other_cloud");

  const s3 = answers.step3 ?? [];
  if (s3.includes("entra_id")) keys.push("entra_id");
  if (s3.includes("google_workspace")) keys.push("google_workspace");
  if (s3.includes("on_prem_ad")) keys.push("on_prem_ad");
  if (s3.includes("okta")) keys.push("okta");

  const s4 = answers.step4;
  if (s4 === "windows") keys.push("windows_workstation");
  if (s4 === "macs") keys.push("macos");
  if (s4 === "both") keys.push("windows_workstation", "macos");

  const s5 = answers.step5 ?? [];
  if (s5.includes("defender")) keys.push("defender");
  if (s5.includes("crowdstrike")) keys.push("crowdstrike");
  if (s5.includes("sentinelone")) keys.push("sentinelone");
  if (s5.includes("intune")) keys.push("intune");
  if (s5.includes("jamf")) keys.push("jamf");
  if (s5.includes("tenable")) keys.push("tenable");
  if (s5.includes("splunk")) keys.push("splunk");

  const s6 = answers.step6 ?? [];
  if (s6.includes("azure_commercial")) keys.push("azure_commercial");
  if (s6.includes("azure_gov")) keys.push("azure_gov");
  if (s6.includes("aws")) keys.push("aws");
  if (s6.includes("gcp")) keys.push("gcp");

  return [...new Set(keys)];
}

export function WelcomeQuestionnaire() {
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState("");
  const [cageCode, setCageCode] = useState("");
  const [primaryAddress, setPrimaryAddress] = useState("");
  const [primaryContactName, setPrimaryContactName] = useState("");
  const [primaryContactEmail, setPrimaryContactEmail] = useState("");
  const [organizationType, setOrganizationType] = useState("");
  const [cmmcTargetLevel, setCmmcTargetLevel] = useState("");
  const [step1, setStep1] = useState("");
  const [step2, setStep2] = useState<string[]>([]);
  const [step3, setStep3] = useState<string[]>([]);
  const [step4, setStep4] = useState("");
  const [step5, setStep5] = useState<string[]>([]);
  const [step6, setStep6] = useState<string[]>([]);
  const [teamMembers, setTeamMembers] = useState<string[]>([""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/organizations")
      .then((r) => (r.ok ? r.json() : null))
      .then((org: { name?: string; cageCode?: string; primaryAddress?: string; primaryContactName?: string; primaryContactEmail?: string; organizationType?: string; cmmcTargetLevel?: string } | null) => {
        if (org) {
          setOrganizationName(org.name ?? "");
          setCageCode(org.cageCode ?? "");
          setPrimaryAddress(org.primaryAddress ?? "");
          setPrimaryContactName(org.primaryContactName ?? "");
          setPrimaryContactEmail(org.primaryContactEmail ?? "");
          setOrganizationType(org.organizationType ?? "");
          setCmmcTargetLevel(org.cmmcTargetLevel ?? "");
        }
      });
  }, []);

  const toggleMulti = useCallback(
    (key: "step2" | "step3" | "step5" | "step6", value: string) => {
      const setters = { step2: setStep2, step3: setStep3, step5: setStep5, step6: setStep6 };
      const state = { step2, step3, step5, step6 }[key] as string[];
      const set = setters[key];
      if (state.includes(value)) set(state.filter((v) => v !== value));
      else set([...state, value]);
    },
    [step2, step3, step5, step6]
  );

  const addTeamMember = () => setTeamMembers((prev) => [...prev, ""]);
  const removeTeamMember = (i: number) =>
    setTeamMembers((prev) => prev.filter((_, j) => j !== i));
  const setTeamMember = (i: number, value: string) =>
    setTeamMembers((prev) => {
      const next = [...prev];
      next[i] = value;
      return next;
    });

  const handleSubmit = useCallback(async () => {
    setError(null);
    setSubmitting(true);
    try {
      const selectedTechnologies = mapInterviewToKeys({ step1, step2, step3, step4, step5, step6 });
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const validTeamEmails = teamMembers.filter((e) => e.trim() && emailRegex.test(e.trim()));

      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: organizationName || undefined,
          cageCode: cageCode || undefined,
          primaryAddress: primaryAddress || undefined,
          primaryContactName: primaryContactName || undefined,
          primaryContactEmail: primaryContactEmail || undefined,
          organizationType: organizationType || undefined,
          cmmcTargetLevel: cmmcTargetLevel || undefined,
          selectedTechnologies,
          teamMembers: validTeamEmails,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.push("/dashboard");
    } finally {
      setSubmitting(false);
    }
  }, [
    organizationName,
    cageCode,
    primaryAddress,
    primaryContactName,
    primaryContactEmail,
    organizationType,
    cmmcTargetLevel,
    step1,
    step2,
    step3,
    step4,
    step5,
    step6,
    teamMembers,
    router,
  ]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      className="space-y-12"
    >
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">Welcome</h1>
        <p className="mt-2 text-gray-600">
          Complete your organization profile and environment so we can tailor your CMMC compliance journey.
        </p>
      </div>

      {/* Section 1: Your Organization */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-6 text-lg font-semibold text-gray-900">Your Organization</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Company legal name</label>
            <input
              type="text"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
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
                  Your CAGE Code is a 5-character identifier assigned by the government. Find it on your contract or at sam.gov.
                </span>
              </span>
            </label>
            <input
              type="text"
              value={cageCode}
              onChange={(e) => setCageCode(e.target.value.slice(0, 10))}
              placeholder="1AB2C"
              maxLength={10}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              aria-label="CAGE Code"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Primary address</label>
            <textarea
              value={primaryAddress}
              onChange={(e) => setPrimaryAddress(e.target.value)}
              placeholder="123 Main St, City, State ZIP"
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              aria-label="Primary address"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Primary contact (name)</label>
              <input
                type="text"
                value={primaryContactName}
                onChange={(e) => setPrimaryContactName(e.target.value)}
                placeholder="Jane Smith"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                aria-label="Primary contact name"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Primary contact (email)</label>
              <input
                type="email"
                value={primaryContactEmail}
                onChange={(e) => setPrimaryContactEmail(e.target.value)}
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
                value={organizationType}
                onChange={(e) => setOrganizationType(e.target.value)}
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
                value={cmmcTargetLevel}
                onChange={(e) => setCmmcTargetLevel(e.target.value)}
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
      </section>

      {/* Section 2: Your Environment */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Your Environment</h2>
        <p className="mb-6 text-sm text-gray-600">
          Answer a few questions about how your organization works. We&apos;ll use this to build your CUI boundary.
        </p>
        <div className="space-y-8">
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Where do your employees typically work?</h3>
            <ul className="space-y-2">
              {STEP_1_OPTIONS.map((opt) => (
                <li key={opt.value}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                    <input
                      type="radio"
                      name="step1"
                      value={opt.value}
                      checked={step1 === opt.value}
                      onChange={() => setStep1(opt.value)}
                      className="h-4 w-4 border-gray-300 text-blue-600"
                    />
                    <span className="text-gray-900">{opt.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900">How do you store and share files for work?</h3>
            <p className="mb-2 text-xs text-gray-500">Select all that apply.</p>
            <ul className="space-y-2">
              {STEP_2_OPTIONS.map((opt) => (
                <li key={opt.value}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={step2.includes(opt.value)}
                      onChange={() => toggleMulti("step2", opt.value)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600"
                    />
                    <span className="text-gray-900">{opt.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900">How do you manage user accounts and passwords?</h3>
            <p className="mb-2 text-xs text-gray-500">Select all that apply.</p>
            <ul className="space-y-2">
              {STEP_3_OPTIONS.map((opt) => (
                <li key={opt.value}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={step3.includes(opt.value)}
                      onChange={() => toggleMulti("step3", opt.value)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600"
                    />
                    <span className="text-gray-900">{opt.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900">What kind of computers do employees use?</h3>
            <ul className="space-y-2">
              {STEP_4_OPTIONS.map((opt) => (
                <li key={opt.value}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                    <input
                      type="radio"
                      name="step4"
                      value={opt.value}
                      checked={step4 === opt.value}
                      onChange={() => setStep4(opt.value)}
                      className="h-4 w-4 border-gray-300 text-blue-600"
                    />
                    <span className="text-gray-900">{opt.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Do you use any of these for security?</h3>
            <p className="mb-2 text-xs text-gray-500">Select all that apply.</p>
            <ul className="space-y-2">
              {STEP_5_OPTIONS.map((opt) => (
                <li key={opt.value}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={step5.includes(opt.value)}
                      onChange={() => toggleMulti("step5", opt.value)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600"
                    />
                    <span className="text-gray-900">{opt.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Do you use a cloud provider for servers or applications?</h3>
            <p className="mb-2 text-xs text-gray-500">Select all that apply.</p>
            <ul className="space-y-2">
              {STEP_6_OPTIONS.map((opt) => (
                <li key={opt.value}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={step6.includes(opt.value)}
                      onChange={() => toggleMulti("step6", opt.value)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600"
                    />
                    <span className="text-gray-900">{opt.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Section 3: Your Team */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Your Team</h2>
        <p className="mb-6 text-sm text-gray-600">Invite team members by email (optional).</p>
        <div className="space-y-3">
          {teamMembers.map((email, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setTeamMember(i, e.target.value)}
                placeholder="teammate@company.com"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                aria-label={`Team member email ${i + 1}`}
              />
              <button
                type="button"
                onClick={() => removeTeamMember(i)}
                disabled={teamMembers.length <= 1}
                className="rounded-lg border border-gray-300 p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                aria-label="Remove"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addTeamMember}
            className="inline-flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:border-gray-400 hover:bg-gray-50"
          >
            <Plus className="h-4 w-4" /> Add team member
          </button>
        </div>
      </section>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-center pb-8">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-blue-600 px-8 py-3 text-base font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Complete Setup & Go to Dashboard"}
        </button>
      </div>
    </form>
  );
}
