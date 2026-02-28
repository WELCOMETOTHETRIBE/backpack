"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

interface ControlItem {
  controlId: string;
  title: string;
}

interface MockAssessmentPlayerProps {
  mockAssessmentId: string;
  controls: ControlItem[];
}

export default function MockAssessmentPlayer({
  mockAssessmentId,
  controls,
}: MockAssessmentPlayerProps) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [question, setQuestion] = useState<string | null>(null);
  const [loadingQuestion, setLoadingQuestion] = useState(true);
  const [userResponse, setUserResponse] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentControl = controls[currentIndex];
  const isLast = currentIndex >= controls.length - 1;

  /** Show a concise control title; avoid run-on text from bad parse (e.g. "; and finally followed by the"). */
  const displayTitle = (() => {
    const t = currentControl?.title ?? "";
    const maxLen = 100;
    const runOn = t.replace(/,?\s*meant to be used for quick reference only[^.]*$/i, "").trim();
    const noRunOn = runOn.replace(/\s*;?\s*and\s+finally\s+followed by[^.]*$/i, "").trim();
    if (noRunOn.length <= maxLen) return noRunOn;
    const atWord = noRunOn.slice(0, maxLen + 1).replace(/\s+\S*$/, "");
    return atWord.length > 20 ? atWord : noRunOn.slice(0, maxLen);
  })();

  useEffect(() => {
    if (!currentControl) {
      setLoadingQuestion(false);
      return;
    }
    let cancelled = false;
    setLoadingQuestion(true);
    setError(null);
    setQuestion(null);
    setUserResponse("");

    (async () => {
      try {
        const res = await fetch("/api/ai/generate-assessment-questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ controlId: currentControl.controlId }),
        });
        if (cancelled) return;
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to load question");
        }
        const data = await res.json();
        const questions = data.questions ?? [];
        const q =
          questions.length > 0
            ? questions[0]
            : `Describe how ${currentControl.title} is implemented and what evidence supports it.`;
        if (!cancelled) setQuestion(q);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load question");
          setQuestion(
            `Describe how ${currentControl.title} is implemented and what evidence supports it.`
          );
        }
      } finally {
        if (!cancelled) setLoadingQuestion(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentIndex]);

  const handleNextOrComplete = async () => {
    if (!currentControl || !question) return;
    if (!userResponse.trim()) {
      setError("Please provide a response before continuing.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const evalRes = await fetch("/api/ai/evaluate-assessment-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          controlId: currentControl.controlId,
          questionText: question,
          userResponse: userResponse.trim(),
        }),
      });
      if (!evalRes.ok) {
        const data = await evalRes.json().catch(() => ({}));
        throw new Error(data.error ?? "Evaluation failed");
      }
      const evalData = await evalRes.json();
      const score = evalData.score ?? "Not Met";
      const rationale = evalData.rationale ?? "";

      const saveRes = await fetch(
        `/api/readiness/mock-assessment/${mockAssessmentId}/response`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            controlId: currentControl.controlId,
            questionText: question,
            userResponse: userResponse.trim(),
            llmEvaluation: rationale,
            score,
          }),
        }
      );
      if (!saveRes.ok) throw new Error("Failed to save response");

      if (isLast) {
        const completeRes = await fetch(
          `/api/readiness/mock-assessment/${mockAssessmentId}/complete`,
          { method: "PATCH" }
        );
        if (!completeRes.ok) throw new Error("Failed to complete assessment");
        router.push(`/dashboard/readiness/mock-assessment/results/${mockAssessmentId}`);
        return;
      }

      setCurrentIndex((i) => i + 1);
      setUserResponse("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setQuestion(null);
      setUserResponse("");
    }
  };

  if (controls.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-600">
        No controls in this assessment.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <p className="mb-4 text-sm text-gray-500">
        Control {currentIndex + 1} of {controls.length}
      </p>
      <h2 className="mb-2 text-xl font-semibold text-[#0F172A]">
        {currentControl.controlId} — {displayTitle}
      </h2>

      {loadingQuestion ? (
        <div className="flex items-center gap-2 py-8 text-gray-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading question...
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-lg bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-700">Interview question</p>
            <p className="mt-1 text-gray-900">{question}</p>
          </div>
          <div className="mb-6">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Your response
            </label>
            <textarea
              value={userResponse}
              onChange={(e) => setUserResponse(e.target.value)}
              rows={5}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
              placeholder="Describe how your organization meets this control..."
            />
          </div>
          {error && (
            <p className="mb-4 text-sm text-red-600">{error}</p>
          )}
        </>
      )}

      <div className="flex justify-between">
        <button
          type="button"
          onClick={handlePrevious}
          disabled={currentIndex === 0 || submitting}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={handleNextOrComplete}
          disabled={loadingQuestion || submitting}
          className="rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-medium text-white hover:bg-[#2563EB] disabled:opacity-50"
        >
          {submitting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </span>
          ) : isLast ? (
            "Complete assessment"
          ) : (
            "Next control"
          )}
        </button>
      </div>
    </div>
  );
}
