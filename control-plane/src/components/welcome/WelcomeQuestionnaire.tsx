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

export function WelcomeQuestionnaire({
  onSuccess,
}: {
  /** When provided, called after successful submit instead of navigating to dashboard (e.g. when used in a modal). */
  onSuccess?: () => void;
} = {}) {
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
  const [openSection, setOpenSection] = useState<1 | 2 | 3>(1);

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

  const section1Complete = organizationName.trim() !== "";
  const section2Complete =
    step1 !== "" ||
    step4 !== "" ||
    step2.length > 0 ||
    step3.length > 0 ||
    step5.length > 0 ||
    step6.length > 0;

  useEffect(() => {
    if (openSection === 1 && section1Complete) setOpenSection(2);
  }, [openSection, section1Complete]);

  useEffect(() => {
    if (openSection === 2 && section2Complete) setOpenSection(3);
  }, [openSection, section2Complete]);

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
      if (onSuccess) {
        onSuccess();
      } else {
        router.push("/dashboard");
      }
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
    onSuccess,
  ]);

  const inputClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[15px] text-slate-900 placeholder:text-slate-400 focus:border-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F172A]/10 transition-colors";
  const labelClass = "mb-1.5 block text-[13px] font-medium text-slate-700";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      className="space-y-10"
    >
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A] sm:text-3xl">
          Set up your organization
        </h1>
        <p className="mt-3 text-[15px] text-slate-600">
          One form. A few minutes. We’ll tailor your CMMC compliance journey from here.
        </p>
      </div>

      {/* Section 1: Your Organization */}
      <details
        open={openSection === 1}
        className="group rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.05)]"
      >
        <summary
          className="cursor-pointer list-none px-6 py-4 sm:px-8 sm:py-5"
          onClick={(e) => {
            e.preventDefault();
            setOpenSection(1);
          }}
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            1. Your Organization
          </span>
        </summary>
        <div className="space-y-5 border-t border-slate-100 px-6 pb-6 pt-4 sm:px-8 sm:pb-8 sm:pt-5">
          <div>
            <label className={labelClass}>Company legal name</label>
            <input
              type="text"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              placeholder="Acme Corp"
              className={inputClass}
              aria-label="Company legal name"
            />
          </div>
          <div>
            <label className={`${labelClass} flex items-center gap-2`}>
              CAGE Code
              <span className="group relative">
                <Info className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                <span className="absolute left-0 top-full z-10 mt-1.5 hidden w-56 rounded-lg bg-slate-800 px-2.5 py-2 text-xs leading-relaxed text-white shadow-lg group-hover:block">
                  Five-character ID from the government. Find it on your contract or at sam.gov.
                </span>
              </span>
            </label>
            <input
              type="text"
              value={cageCode}
              onChange={(e) => setCageCode(e.target.value.slice(0, 10))}
              placeholder="1AB2C"
              maxLength={10}
              className={inputClass}
              aria-label="CAGE Code"
            />
          </div>
          <div>
            <label className={labelClass}>Primary address</label>
            <textarea
              value={primaryAddress}
              onChange={(e) => setPrimaryAddress(e.target.value)}
              placeholder="123 Main St, City, State ZIP"
              rows={2}
              className={inputClass}
              aria-label="Primary address"
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Primary contact (name)</label>
              <input
                type="text"
                value={primaryContactName}
                onChange={(e) => setPrimaryContactName(e.target.value)}
                placeholder="Jane Smith"
                className={inputClass}
                aria-label="Primary contact name"
              />
            </div>
            <div>
              <label className={labelClass}>Primary contact (email)</label>
              <input
                type="email"
                value={primaryContactEmail}
                onChange={(e) => setPrimaryContactEmail(e.target.value)}
                placeholder="jane@company.com"
                className={inputClass}
                aria-label="Primary contact email"
              />
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Organization type</label>
              <select
                value={organizationType}
                onChange={(e) => setOrganizationType(e.target.value)}
                className={inputClass}
                aria-label="Organization type"
              >
                <option value="">Select type…</option>
                <option value="prime">Prime Contractor</option>
                <option value="sub">Subcontractor</option>
                <option value="both">Both Prime and Sub</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>CMMC target level</label>
              <select
                value={cmmcTargetLevel}
                onChange={(e) => setCmmcTargetLevel(e.target.value)}
                className={inputClass}
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
      </details>

      {/* Section 2: Your Environment */}
      <details
        open={openSection === 2}
        className="group rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.05)]"
      >
        <summary
          className="cursor-pointer list-none px-6 py-4 sm:px-8 sm:py-5"
          onClick={(e) => {
            e.preventDefault();
            setOpenSection(2);
          }}
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            2. Your Environment
          </span>
        </summary>
        <div className="space-y-7 border-t border-slate-100 px-6 pb-6 pt-4 sm:px-8 sm:pb-8 sm:pt-5">
        <p className="text-[14px] text-slate-600">
          We’ll use this to build your CUI boundary and tailor evidence requirements.
        </p>
          <div>
            <h3 className="mb-2 text-[13px] font-medium text-slate-800">Where do employees typically work?</h3>
            <ul className="space-y-1.5">
              {STEP_1_OPTIONS.map((opt) => (
                <li key={opt.value}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 transition-colors hover:border-slate-300 hover:bg-slate-50 has-[:checked]:border-[#0F172A] has-[:checked]:bg-[#0F172A]/5">
                    <input type="radio" name="step1" value={opt.value} checked={step1 === opt.value} onChange={() => setStep1(opt.value)} className="h-4 w-4 border-slate-300 text-[#0F172A]" />
                    <span className="text-[14px] text-slate-800">{opt.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1.5 text-[13px] font-medium text-slate-800">How do you store and share files?</h3>
            <p className="mb-2 text-xs text-slate-500">Select all that apply.</p>
            <ul className="space-y-1.5">
              {STEP_2_OPTIONS.map((opt) => (
                <li key={opt.value}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 transition-colors hover:border-slate-300 hover:bg-slate-50 has-[:checked]:border-[#0F172A] has-[:checked]:bg-[#0F172A]/5">
                    <input type="checkbox" checked={step2.includes(opt.value)} onChange={() => toggleMulti("step2", opt.value)} className="h-4 w-4 rounded border-slate-300 text-[#0F172A]" />
                    <span className="text-[14px] text-slate-800">{opt.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1.5 text-[13px] font-medium text-slate-800">User accounts and passwords?</h3>
            <p className="mb-2 text-xs text-slate-500">Select all that apply.</p>
            <ul className="space-y-1.5">
              {STEP_3_OPTIONS.map((opt) => (
                <li key={opt.value}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 transition-colors hover:border-slate-300 hover:bg-slate-50 has-[:checked]:border-[#0F172A] has-[:checked]:bg-[#0F172A]/5">
                    <input type="checkbox" checked={step3.includes(opt.value)} onChange={() => toggleMulti("step3", opt.value)} className="h-4 w-4 rounded border-slate-300 text-[#0F172A]" />
                    <span className="text-[14px] text-slate-800">{opt.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-[13px] font-medium text-slate-800">What kind of computers?</h3>
            <ul className="space-y-1.5">
              {STEP_4_OPTIONS.map((opt) => (
                <li key={opt.value}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 transition-colors hover:border-slate-300 hover:bg-slate-50 has-[:checked]:border-[#0F172A] has-[:checked]:bg-[#0F172A]/5">
                    <input type="radio" name="step4" value={opt.value} checked={step4 === opt.value} onChange={() => setStep4(opt.value)} className="h-4 w-4 border-slate-300 text-[#0F172A]" />
                    <span className="text-[14px] text-slate-800">{opt.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1.5 text-[13px] font-medium text-slate-800">Security tools?</h3>
            <p className="mb-2 text-xs text-slate-500">Select all that apply.</p>
            <ul className="space-y-1.5">
              {STEP_5_OPTIONS.map((opt) => (
                <li key={opt.value}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 transition-colors hover:border-slate-300 hover:bg-slate-50 has-[:checked]:border-[#0F172A] has-[:checked]:bg-[#0F172A]/5">
                    <input type="checkbox" checked={step5.includes(opt.value)} onChange={() => toggleMulti("step5", opt.value)} className="h-4 w-4 rounded border-slate-300 text-[#0F172A]" />
                    <span className="text-[14px] text-slate-800">{opt.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1.5 text-[13px] font-medium text-slate-800">Cloud provider for servers or apps?</h3>
            <p className="mb-2 text-xs text-slate-500">Select all that apply.</p>
            <ul className="space-y-1.5">
              {STEP_6_OPTIONS.map((opt) => (
                <li key={opt.value}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 transition-colors hover:border-slate-300 hover:bg-slate-50 has-[:checked]:border-[#0F172A] has-[:checked]:bg-[#0F172A]/5">
                    <input type="checkbox" checked={step6.includes(opt.value)} onChange={() => toggleMulti("step6", opt.value)} className="h-4 w-4 rounded border-slate-300 text-[#0F172A]" />
                    <span className="text-[14px] text-slate-800">{opt.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </details>

      {/* Section 3: Your Team */}
      <details
        open={openSection === 3}
        className="group rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.05)]"
      >
        <summary
          className="cursor-pointer list-none px-6 py-4 sm:px-8 sm:py-5"
          onClick={(e) => {
            e.preventDefault();
            setOpenSection(3);
          }}
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            3. Your Team
          </span>
        </summary>
        <div className="border-t border-slate-100 px-6 pb-6 pt-4 sm:px-8 sm:pb-8 sm:pt-5">
        <p className="mb-5 text-[14px] text-slate-600">Invite team members by email (optional).</p>
        <div className="space-y-3">
          {teamMembers.map((email, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setTeamMember(i, e.target.value)}
                placeholder="teammate@company.com"
                className={inputClass}
                aria-label={`Team member email ${i + 1}`}
              />
              <button
                type="button"
                onClick={() => removeTeamMember(i)}
                disabled={teamMembers.length <= 1}
                className="shrink-0 rounded-lg border border-slate-200 p-2.5 text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-40"
                aria-label="Remove"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addTeamMember}
            className="inline-flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3.5 py-2.5 text-[14px] font-medium text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" /> Add team member
          </button>
        </div>
        </div>
      </details>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <div className="pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-[#0F172A] px-6 py-3.5 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-[#1e293b] disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Complete setup & go to dashboard"}
        </button>
      </div>
    </form>
  );
}
