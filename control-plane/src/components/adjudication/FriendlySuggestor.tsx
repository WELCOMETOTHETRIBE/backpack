"use client";

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

const N_A_QUESTIONS = [
  "Is this control satisfied by your Cloud Service Provider's authorization (e.g., FedRAMP)?",
  "Is this control outside your CUI boundary scope (e.g., not applicable to your environment)?",
];

type Suggestion = "inherited" | "not_applicable" | null;

export function FriendlySuggestor({
  controlRecordId,
  controlId,
  onApply,
  onCancel,
}: {
  controlRecordId: string;
  controlId: string;
  onApply: (status: "inherited" | "not_applicable") => void;
  onCancel: () => void;
}) {
  const [answers, setAnswers] = useState<Record<number, "yes" | "no">>({});
  const [applying, setApplying] = useState(false);

  const q0 = answers[0];
  const q1 = answers[1];
  let suggestion: Suggestion = null;
  if (q0 === "yes") suggestion = "inherited";
  else if (q1 === "yes") suggestion = "not_applicable";

  async function apply(s: "inherited" | "not_applicable") {
    setApplying(true);
    try {
      const res = await fetch(`/api/control-records/${controlRecordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ implementationStatus: s }),
      });
      if (res.ok) onApply(s);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-4">
      <h4 className="mb-3 text-sm font-semibold text-amber-900">
        Not applicable? — Quick check
      </h4>
      <ul className="space-y-3">
        {N_A_QUESTIONS.map((q, i) => (
          <li key={i}>
            <p className="mb-1.5 text-sm text-amber-900">{q}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setAnswers((prev) => ({ ...prev, [i]: "yes" }))
                }
                className={`inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-sm font-medium ${
                  answers[i] === "yes"
                    ? "border-green-500 bg-green-50 text-green-800"
                    : "border-amber-200 bg-white text-amber-900 hover:border-green-300"
                }`}
              >
                <CheckCircle2 className="h-4 w-4" /> Yes
              </button>
              <button
                type="button"
                onClick={() =>
                  setAnswers((prev) => ({ ...prev, [i]: "no" }))
                }
                className={`inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-sm font-medium ${
                  answers[i] === "no"
                    ? "border-amber-500 bg-amber-100 text-amber-800"
                    : "border-amber-200 bg-white text-amber-900 hover:border-amber-300"
                }`}
              >
                <XCircle className="h-4 w-4" /> No
              </button>
            </div>
          </li>
        ))}
      </ul>
      {suggestion && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-amber-200 pt-3">
          <span className="text-sm font-medium text-amber-900">
            Suggestion: Mark as {suggestion === "inherited" ? "Inherited" : "N/A"}.
          </span>
          <button
            type="button"
            onClick={() => apply(suggestion!)}
            disabled={applying}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {applying ? "Applying…" : `Mark as ${suggestion === "inherited" ? "Inherited" : "N/A"}`}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-amber-800 hover:underline"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
