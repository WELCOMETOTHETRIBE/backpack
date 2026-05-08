"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

const NIST_FAMILIES: Array<{ code: string; name: string }> = [
  { code: "AC", name: "Access Control" },
  { code: "AT", name: "Awareness and Training" },
  { code: "AU", name: "Audit and Accountability" },
  { code: "CM", name: "Configuration Management" },
  { code: "IA", name: "Identification and Authentication" },
  { code: "IR", name: "Incident Response" },
  { code: "MA", name: "Maintenance" },
  { code: "MP", name: "Media Protection" },
  { code: "PE", name: "Physical Protection" },
  { code: "PS", name: "Personnel Security" },
  { code: "RA", name: "Risk Assessment" },
  { code: "CA", name: "Security Assessment" },
  { code: "SC", name: "System and Communications Protection" },
  { code: "SI", name: "System and Information Integrity" },
];

type ScopeMode = "full" | "focused" | "family";

export default function MockAssessmentPage() {
  const router = useRouter();
  const [mode, setMode] = useState<ScopeMode>("full");
  const [familyCode, setFamilyCode] = useState<string>("AC");
  const [generating, setGenerating] = useState(false);

  async function startAssessment() {
    setGenerating(true);
    try {
      const payload: { scope: string; familyCode?: string } =
        mode === "family" ? { scope: "family", familyCode } : { scope: mode };
      const res = await fetch("/api/readiness/mock-assessment/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data.error ?? "Failed to start assessment");
        return;
      }

      const id = data.mockAssessmentId;
      if (id) {
        toast.success("Assessment started.");
        router.push(`/dashboard/readiness/mock-assessment/${id}`);
        return;
      }
      toast.error("No assessment ID returned");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start assessment");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#0F172A]">Mock Assessment Simulator</h1>
        <p className="mt-2 text-gray-600">
          Practice the C3PAO audit process with an LLM-powered assessment. Questions are generated from NIST 800-171A procedures and your responses are evaluated automatically.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-8">
        <h2 className="mb-4 text-xl font-semibold text-[#0F172A]">Assessment Scope</h2>
        <div className="space-y-4">
          <label className="flex items-start gap-3">
            <input
              type="radio"
              name="mode"
              value="full"
              checked={mode === "full"}
              onChange={() => setMode("full")}
              className="mt-1 h-4 w-4 text-indigo-600"
            />
            <div>
              <div className="font-medium text-gray-900">Full (sample of 30 controls)</div>
              <div className="text-sm text-gray-600">Representative sample across all NIST SP 800-171 Rev 2 control families</div>
            </div>
          </label>
          <label className="flex items-start gap-3">
            <input
              type="radio"
              name="mode"
              value="focused"
              checked={mode === "focused"}
              onChange={() => setMode("focused")}
              className="mt-1 h-4 w-4 text-indigo-600"
            />
            <div>
              <div className="font-medium text-gray-900">Focused (AC &amp; IA)</div>
              <div className="text-sm text-gray-600">Access Control and Identification &amp; Authentication families (sample of 20)</div>
            </div>
          </label>
          <label className="flex items-start gap-3">
            <input
              type="radio"
              name="mode"
              value="family"
              checked={mode === "family"}
              onChange={() => setMode("family")}
              className="mt-1 h-4 w-4 text-indigo-600"
            />
            <div className="flex-1">
              <div className="font-medium text-gray-900">Specific control family</div>
              <div className="text-sm text-gray-600 mb-2">Target a single NIST SP 800-171 Rev 2 family (up to 20 controls)</div>
              <select
                value={familyCode}
                onChange={(e) => {
                  setFamilyCode(e.target.value);
                  setMode("family");
                }}
                disabled={mode !== "family"}
                className="rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-500"
              >
                {NIST_FAMILIES.map((f) => (
                  <option key={f.code} value={f.code}>
                    {f.code} — {f.name}
                  </option>
                ))}
              </select>
            </div>
          </label>
        </div>
        <button
          onClick={startAssessment}
          disabled={generating}
          className="mt-6 rounded-2xl bg-indigo-600 px-6 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {generating ? "Starting..." : "Start Mock Assessment"}
        </button>
      </div>
    </div>
  );
}
