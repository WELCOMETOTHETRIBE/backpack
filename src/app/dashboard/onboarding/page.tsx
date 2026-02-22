"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ArrowRight, ArrowLeft } from "lucide-react";

type OnboardingStep = 1 | 2 | 3 | 4 | 5;

interface OnboardingData {
  organizationType: string;
  cmmcTargetLevel: string;
  cuiBoundary: string;
  systemScope: string;
  teamMembers: string[];
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>(1);
  const [data, setData] = useState<OnboardingData>({
    organizationType: "",
    cmmcTargetLevel: "",
    cuiBoundary: "",
    systemScope: "",
    teamMembers: [],
  });
  const [submitting, setSubmitting] = useState(false);

  async function handleComplete() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        router.push("/dashboard");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#0F172A]">Welcome to CMMC OS</h1>
        <p className="mt-2 text-gray-600">Let's get your organization set up for CMMC compliance</p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8 flex items-center justify-between">
        {[1, 2, 3, 4, 5].map((s) => (
          <div key={s} className="flex items-center">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                step >= s
                  ? "border-[#3B82F6] bg-[#3B82F6] text-white"
                  : "border-gray-300 bg-white text-gray-400"
              }`}
            >
              {step > s ? <CheckCircle2 className="h-5 w-5" /> : s}
            </div>
            {s < 5 && (
              <div
                className={`h-1 w-16 ${
                  step > s ? "bg-[#3B82F6]" : "bg-gray-300"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="rounded-lg border border-gray-200 bg-white p-8">
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-[#0F172A]">Organization Type & CMMC Level</h2>
              <p className="mt-1 text-sm text-gray-600">
                Tell us about your organization and your CMMC target level
              </p>
            </div>
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
            <div>
              <h2 className="text-xl font-semibold text-[#0F172A]">CUI Boundary & System Scope</h2>
              <p className="mt-1 text-sm text-gray-600">
                Define your Controlled Unclassified Information boundary and system scope
              </p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">CUI Boundary Description</label>
              <textarea
                value={data.cuiBoundary}
                onChange={(e) => setData({ ...data, cuiBoundary: e.target.value })}
                rows={4}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
                placeholder="Describe the boundary of your CUI environment..."
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">System Scope</label>
              <textarea
                value={data.systemScope}
                onChange={(e) => setData({ ...data, systemScope: e.target.value })}
                rows={4}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
                placeholder="Describe the scope of systems covered by CMMC..."
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-[#0F172A]">Team Members</h2>
              <p className="mt-1 text-sm text-gray-600">
                Add team members who will help manage compliance (optional - can add later)
              </p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Email Addresses</label>
              <textarea
                value={data.teamMembers.join("\n")}
                onChange={(e) =>
                  setData({
                    ...data,
                    teamMembers: e.target.value.split("\n").filter((e) => e.trim()),
                  })
                }
                rows={6}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
                placeholder="Enter email addresses, one per line..."
              />
              <p className="mt-1 text-xs text-gray-500">
                Invitations will be sent after onboarding completes
              </p>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-[#0F172A]">Initial Gap Assessment</h2>
              <p className="mt-1 text-sm text-gray-600">
                We'll initialize all 110 controls to "Not Started" status. You can update them as you complete your gap assessment.
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm text-gray-700">
                <strong>What happens next:</strong>
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
                <li>All 110 NIST SP 800-171 Rev 2 controls will be initialized</li>
                <li>Your compliance score will start at 0%</li>
                <li>You can begin updating control statuses as you assess your environment</li>
                <li>Use the AI assistant to help generate implementation narratives</li>
              </ul>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-[#0F172A]">Review & Complete</h2>
              <p className="mt-1 text-sm text-gray-600">Review your settings and complete onboarding</p>
            </div>
            <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div>
                <span className="text-sm font-medium text-gray-700">Organization Type:</span>
                <span className="ml-2 text-sm text-gray-900">{data.organizationType || "Not set"}</span>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-700">CMMC Target Level:</span>
                <span className="ml-2 text-sm text-gray-900">{data.cmmcTargetLevel || "Not set"}</span>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-700">Team Members:</span>
                <span className="ml-2 text-sm text-gray-900">
                  {data.teamMembers.length > 0 ? `${data.teamMembers.length} members` : "None added"}
                </span>
              </div>
            </div>
            <div className="rounded-lg border border-[#10B981] bg-[#10B981]/10 p-4">
              <p className="text-sm text-[#10B981]">
                ✓ Ready to begin! Click "Complete Setup" to initialize your compliance workspace.
              </p>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="mt-8 flex justify-between">
          <button
            onClick={() => setStep((s) => Math.max(1, (s - 1) as OnboardingStep) as OnboardingStep)}
            disabled={step === 1}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Previous
          </button>
          {step < 5 ? (
            <button
              onClick={() => setStep((s) => Math.min(5, (s + 1) as OnboardingStep) as OnboardingStep)}
              className="flex items-center gap-2 rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-medium text-white hover:bg-[#2563EB]"
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleComplete}
              disabled={submitting}
              className="flex items-center gap-2 rounded-lg bg-[#10B981] px-4 py-2 text-sm font-medium text-white hover:bg-[#059669] disabled:opacity-50"
            >
              {submitting ? "Setting up..." : "Complete Setup"}
              <CheckCircle2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
