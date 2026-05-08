"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function OpenAssessmentForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ assessment_id: string; narratives_locked: number } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);

    const fd = new FormData(e.currentTarget);
    const body = {
      title: String(fd.get("title") ?? "").trim(),
      assessor_name: String(fd.get("assessor_name") ?? "").trim() || null,
      assessor_org: String(fd.get("assessor_org") ?? "").trim() || null,
      assessor_email: String(fd.get("assessor_email") ?? "").trim() || null,
    };
    if (!body.title) {
      setError("Title is required.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload.error ?? `Server returned ${res.status}`);
        setSubmitting(false);
        return;
      }
      const data = (await res.json()) as {
        assessment_id: string;
        narratives_locked: number;
      };
      setResult(data);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Title" name="title" required placeholder="e.g. MacTech 2026Q2 C3PAO assessment" />
        <Field label="Assessor name" name="assessor_name" placeholder="(optional)" />
        <Field label="Assessor org" name="assessor_org" placeholder="(optional)" />
        <Field label="Assessor email" name="assessor_email" type="email" placeholder="(optional)" />
      </div>
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {result && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          Assessment opened. {result.narratives_locked} observed-implementation narratives now frozen for the duration.
        </div>
      )}
      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-[var(--color-navy-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-navy-deep)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Opening…" : "Open assessment"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  required,
  type = "text",
  placeholder,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-[var(--color-gray-700)]">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <input
        type={type}
        name={name}
        required={required}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-blue-accent)]"
      />
    </label>
  );
}
