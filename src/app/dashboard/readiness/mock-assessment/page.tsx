"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, AlertCircle, FileText } from "lucide-react";

interface AssessmentControl {
  controlId: string;
  title: string;
  examineEvidence: string[];
  testCase: string;
  interviewQuestions: string[];
}

interface AssessmentState {
  controls: AssessmentControl[];
  currentIndex: number;
  responses: Record<string, {
    examine: "pass" | "fail" | null;
    test: "pass" | "fail" | null;
    interview: "pass" | "fail" | null;
    notes: string;
  }>;
}

export default function MockAssessmentPage() {
  const router = useRouter();
  const [scope, setScope] = useState<"full" | "focused">("full");
  const [assessment, setAssessment] = useState<AssessmentState | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showReport, setShowReport] = useState(false);

  async function startAssessment() {
    setGenerating(true);
    try {
      const res = await fetch("/api/readiness/mock-assessment/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });

      if (!res.ok) throw new Error("Failed to start assessment");

      const data = await res.json();
      setAssessment({
        controls: data.controls,
        currentIndex: 0,
        responses: {},
      });
    } catch (err) {
      alert("Failed to start assessment");
    } finally {
      setGenerating(false);
    }
  }

  function updateResponse(controlId: string, section: "examine" | "test" | "interview", value: "pass" | "fail") {
    if (!assessment) return;
    setAssessment({
      ...assessment,
      responses: {
        ...assessment.responses,
        [controlId]: {
          ...assessment.responses[controlId],
          [section]: value,
        },
      },
    });
  }

  function nextControl() {
    if (!assessment) return;
    if (assessment.currentIndex < assessment.controls.length - 1) {
      setAssessment({ ...assessment, currentIndex: assessment.currentIndex + 1 });
    } else {
      setShowReport(true);
    }
  }

  function previousControl() {
    if (!assessment || assessment.currentIndex === 0) return;
    setAssessment({ ...assessment, currentIndex: assessment.currentIndex - 1 });
  }

  if (showReport && assessment) {
    return <AssessmentReport assessment={assessment} onClose={() => setShowReport(false)} />;
  }

  if (!assessment) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[#0F172A]">Mock Assessment Simulator</h1>
          <p className="mt-2 text-gray-600">
            Practice the C3PAO audit process with a guided assessment workflow
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
                <div className="font-medium text-gray-900">Full 110 Controls</div>
                <div className="text-sm text-gray-600">Complete assessment of all NIST SP 800-171 Rev 2 controls</div>
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
                <div className="font-medium text-gray-900">Focused Assessment</div>
                <div className="text-sm text-gray-600">Focus on AC (Access Control) and IA (Identification & Authentication) families</div>
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

  const currentControl = assessment.controls[assessment.currentIndex];
  const response = assessment.responses[currentControl.controlId] || {
    examine: null,
    test: null,
    interview: null,
    notes: "",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#0F172A]">Mock Assessment</h1>
        <p className="mt-2 text-gray-600">
          Control {assessment.currentIndex + 1} of {assessment.controls.length}
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-[#0F172A]">
            {currentControl.controlId} — {currentControl.title}
          </h2>
        </div>

        {/* Examine Section */}
        <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-900">
            <FileText className="h-5 w-5" />
            Examine
          </h3>
          <p className="mb-3 text-sm text-gray-700">
            Review the linked evidence metadata and confirm it is current and accessible.
          </p>
          {currentControl.examineEvidence.length > 0 ? (
            <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
              {currentControl.examineEvidence.map((ev, idx) => (
                <li key={idx}>{ev}</li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-sm text-gray-500 italic">No evidence linked to this control</p>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => updateResponse(currentControl.controlId, "examine", "pass")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
                response.examine === "pass"
                  ? "bg-[#10B981] text-white"
                  : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              }`}
            >
              <CheckCircle2 className="h-4 w-4" />
              Pass
            </button>
            <button
              onClick={() => updateResponse(currentControl.controlId, "examine", "fail")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
                response.examine === "fail"
                  ? "bg-[#EF4444] text-white"
                  : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              }`}
            >
              <XCircle className="h-4 w-4" />
              Fail
            </button>
          </div>
        </div>

        {/* Test Section */}
        <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-900">
            <AlertCircle className="h-5 w-5" />
            Test
          </h3>
          <p className="mb-3 text-sm text-gray-700">{currentControl.testCase}</p>
          <div className="flex gap-3">
            <button
              onClick={() => updateResponse(currentControl.controlId, "test", "pass")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
                response.test === "pass"
                  ? "bg-[#10B981] text-white"
                  : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              }`}
            >
              <CheckCircle2 className="h-4 w-4" />
              Pass
            </button>
            <button
              onClick={() => updateResponse(currentControl.controlId, "test", "fail")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
                response.test === "fail"
                  ? "bg-[#EF4444] text-white"
                  : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              }`}
            >
              <XCircle className="h-4 w-4" />
              Fail
            </button>
          </div>
        </div>

        {/* Interview Section */}
        <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-900">
            <FileText className="h-5 w-5" />
            Interview
          </h3>
          <p className="mb-3 text-sm text-gray-700">Questions an assessor would ask:</p>
          <ul className="mb-3 list-disc space-y-2 pl-5 text-sm text-gray-600">
            {currentControl.interviewQuestions.map((q, idx) => (
              <li key={idx}>{q}</li>
            ))}
          </ul>
          <div className="flex gap-3">
            <button
              onClick={() => updateResponse(currentControl.controlId, "interview", "pass")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
                response.interview === "pass"
                  ? "bg-[#10B981] text-white"
                  : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              }`}
            >
              <CheckCircle2 className="h-4 w-4" />
              Pass
            </button>
            <button
              onClick={() => updateResponse(currentControl.controlId, "interview", "fail")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
                response.interview === "fail"
                  ? "bg-[#EF4444] text-white"
                  : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              }`}
            >
              <XCircle className="h-4 w-4" />
              Fail
            </button>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-between">
          <button
            onClick={previousControl}
            disabled={assessment.currentIndex === 0}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={nextControl}
            className="rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-medium text-white hover:bg-[#2563EB]"
          >
            {assessment.currentIndex === assessment.controls.length - 1 ? "View Report" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AssessmentReport({
  assessment,
  onClose,
}: {
  assessment: AssessmentState;
  onClose: () => void;
}) {
  const findings: Array<{
    controlId: string;
    title: string;
    severity: "Critical" | "High" | "Medium" | "Low";
    section: string;
  }> = [];

  assessment.controls.forEach((control) => {
    const response = assessment.responses[control.controlId];
    if (!response) return;

    if (response.examine === "fail") {
      findings.push({
        controlId: control.controlId,
        title: control.title,
        severity: "High",
        section: "Examine",
      });
    }
    if (response.test === "fail") {
      findings.push({
        controlId: control.controlId,
        title: control.title,
        severity: "Critical",
        section: "Test",
      });
    }
    if (response.interview === "fail") {
      findings.push({
        controlId: control.controlId,
        title: control.title,
        severity: "Medium",
        section: "Interview",
      });
    }
  });

  const critical = findings.filter((f) => f.severity === "Critical").length;
  const high = findings.filter((f) => f.severity === "High").length;
  const medium = findings.filter((f) => f.severity === "Medium").length;
  const low = findings.filter((f) => f.severity === "Low").length;

  const totalAssessed = assessment.controls.length;
  const totalPassed =
    totalAssessed -
    findings.length;
  const readinessScore = totalAssessed > 0 ? Math.round((totalPassed / totalAssessed) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#0F172A]">Mock Assessment Report</h1>
        <p className="mt-2 text-gray-600">Assessment completed on {new Date().toLocaleDateString()}</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-[#0F172A]">Readiness Score</h2>
          <div className="text-5xl font-bold text-[#3B82F6]">{readinessScore}%</div>
          <p className="mt-2 text-sm text-gray-600">
            {totalPassed} of {totalAssessed} controls passed
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-[#0F172A]">Findings Summary</h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Critical:</span>
              <span className="font-semibold text-[#EF4444]">{critical}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">High:</span>
              <span className="font-semibold text-[#F59E0B]">{high}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Medium:</span>
              <span className="font-semibold text-[#F59E0B]">{medium}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Low:</span>
              <span className="font-semibold text-gray-600">{low}</span>
            </div>
          </div>
        </div>
      </div>

      {findings.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-[#0F172A]">Findings</h2>
          <div className="space-y-3">
            {findings.map((finding, idx) => (
              <div key={idx} className="rounded border border-gray-200 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-gray-900">
                      {finding.controlId} — {finding.title}
                    </div>
                    <div className="mt-1 text-sm text-gray-600">Section: {finding.section}</div>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      finding.severity === "Critical"
                        ? "bg-[#EF4444]/10 text-[#EF4444]"
                        : finding.severity === "High"
                          ? "bg-[#F59E0B]/10 text-[#F59E0B]"
                          : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {finding.severity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={onClose}
          className="rounded-lg bg-[#3B82F6] px-6 py-2 font-medium text-white hover:bg-[#2563EB]"
        >
          Close
        </button>
      </div>
    </div>
  );
}
