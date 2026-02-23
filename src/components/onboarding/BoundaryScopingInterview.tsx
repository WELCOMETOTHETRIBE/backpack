"use client";

import { useState, useCallback } from "react";
import { ArrowRight, ArrowLeft, Check } from "lucide-react";

const TOTAL_STEPS = 6;

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

export function BoundaryScopingInterview({
  onComplete,
}: {
  onComplete?: (selectedTechnologies: string[]) => void;
}) {
  const [step, setStep] = useState(1);
  const [step1, setStep1] = useState<string>("");
  const [step2, setStep2] = useState<string[]>([]);
  const [step3, setStep3] = useState<string[]>([]);
  const [step4, setStep4] = useState<string>("");
  const [step5, setStep5] = useState<string[]>([]);
  const [step6, setStep6] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const submitInterview = useCallback(async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/boundary/profile-from-interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step1: step1 || undefined,
          step2: step2.length ? step2 : undefined,
          step3: step3.length ? step3 : undefined,
          step4: step4 || undefined,
          step5: step5.length ? step5 : undefined,
          step6: step6.length ? step6 : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to save");
        return;
      }
      onComplete?.(data.selectedTechnologies ?? []);
    } finally {
      setSubmitting(false);
    }
  }, [step1, step2, step3, step4, step5, step6, onComplete]);

  const canProceed =
    (step === 1 && step1) ||
    (step === 2) ||
    (step === 3) ||
    (step === 4 && step4) ||
    (step === 5) ||
    (step === 6);
  const isLast = step === TOTAL_STEPS;

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">
        Answer a few questions about how your organization works. We&apos;ll use this to build your CUI boundary.
      </p>

      {step === 1 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-900">
            Where do your employees typically work?
          </h3>
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
      )}

      {step === 2 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-900">
            How do you store and share files for work?
          </h3>
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
      )}

      {step === 3 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-900">
            How do you manage user accounts and passwords?
          </h3>
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
      )}

      {step === 4 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-900">
            What kind of computers do employees use?
          </h3>
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
      )}

      {step === 5 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-900">
            Do you use any of these for security?
          </h3>
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
      )}

      {step === 6 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-900">
            Do you use a cloud provider for servers or applications?
          </h3>
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
      )}

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-between pt-4">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          aria-label="Previous"
        >
          <ArrowLeft className="h-4 w-4" /> Previous
        </button>
        {isLast ? (
          <button
            type="button"
            onClick={submitInterview}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            aria-label="Finish interview"
          >
            {submitting ? "Saving…" : "Finish"}{" "}
            <Check className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={!canProceed && step === 1}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            aria-label="Next"
          >
            Next <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Step {step} of {TOTAL_STEPS}
      </p>
    </div>
  );
}
