"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

export default function MockAssessmentPage() {
  const router = useRouter();
  const [scope, setScope] = useState<"full" | "focused">("full");
  const [generating, setGenerating] = useState(false);

  async function startAssessment() {
    setGenerating(true);
    try {
      const res = await fetch("/api/readiness/mock-assessment/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
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

      <div className="rounded-lg border border-gray-200 bg-white p-8">
        <h2 className="mb-4 text-xl font-semibold text-[#0F172A]">Assessment Scope</h2>
        <div className="space-y-4">
          <label className="flex items-center gap-3">
            <input
              type="radio"
              name="scope"
              value="full"
              checked={scope === "full"}
              onChange={(e) => setScope(e.target.value as "full" | "focused")}
              className="h-4 w-4 text-[#3B82F6]"
            />
            <div>
              <div className="font-medium text-gray-900">Full (sample of 30 controls)</div>
              <div className="text-sm text-gray-600">Representative sample across all NIST SP 800-171 Rev 2 control families</div>
            </div>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="radio"
              name="scope"
              value="focused"
              checked={scope === "focused"}
              onChange={(e) => setScope(e.target.value as "focused" | "full")}
              className="h-4 w-4 text-[#3B82F6]"
            />
            <div>
              <div className="font-medium text-gray-900">Focused (AC & IA)</div>
              <div className="text-sm text-gray-600">Access Control and Identification & Authentication families (sample of 20)</div>
            </div>
          </label>
        </div>
        <button
          onClick={startAssessment}
          disabled={generating}
          className="mt-6 rounded-lg bg-[#3B82F6] px-6 py-2 font-medium text-white hover:bg-[#2563EB] disabled:opacity-50"
        >
          {generating ? "Starting..." : "Start Mock Assessment"}
        </button>
      </div>
    </div>
  );
}
