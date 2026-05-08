"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CloseAssessmentForm({
  assessmentId,
}: {
  assessmentId: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    payload_hash: string;
    counts: Record<string, number>;
  } | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const body = {
      closeout_summary: String(fd.get("closeout_summary") ?? "").trim() || null,
      assessor_signature: String(fd.get("assessor_signature") ?? "").trim() || null,
    };

    try {
      const res = await fetch(
        `/api/admin/assessments/${assessmentId}/close`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload.error ?? `Server returned ${res.status}`);
        setSubmitting(false);
        return;
      }
      const data = (await res.json()) as {
        payload_hash: string;
        counts: Record<string, number>;
      };
      setResult(data);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
        <p className="font-medium">Assessment closed.</p>
        <p className="mt-1 text-xs">
          Receipt sha256:{" "}
          <code className="font-mono">{result.payload_hash.slice(0, 16)}…{result.payload_hash.slice(-4)}</code>
        </p>
        <p className="mt-1 text-xs">
          {result.counts.controls_in_receipt} controls captured ·{" "}
          {result.counts.cae_satisfies} engine-satisfies /{" "}
          {result.counts.cae_partial} partial /{" "}
          {result.counts.cae_at_risk} at-risk /{" "}
          {result.counts.cae_gap} gap ·{" "}
          {result.counts.assessor_satisfies + result.counts.assessor_partial + result.counts.assessor_gap + result.counts.assessor_n_a} assessor verdicts recorded ·{" "}
          {result.counts.threat_narratives_recorded} threat narratives.
        </p>
      </div>
    );
  }

  if (!showForm) {
    return (
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="text-xs text-[var(--color-blue-accent)] hover:underline"
        >
          Close + generate receipt →
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2">
      <label className="block">
        <span className="text-xs font-medium text-amber-900">
          Close-out summary (optional)
        </span>
        <textarea
          name="closeout_summary"
          rows={3}
          placeholder="Summary of the assessment outcome — assessor's overall conclusion + any open items."
          className="mt-1 block w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-amber-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-amber-900">
          Assessor signature (optional)
        </span>
        <input
          type="text"
          name="assessor_signature"
          placeholder="Free text — assessor's printed name + date, or a structured signature reference."
          className="mt-1 block w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-amber-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </label>
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800">
          {error}
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setShowForm(false)}
          className="text-xs text-[var(--color-gray-600)] hover:underline"
        >
          cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Closing…" : "Close assessment + sign receipt"}
        </button>
      </div>
    </form>
  );
}
