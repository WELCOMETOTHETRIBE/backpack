"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewGovernanceDocumentPage() {
  const router = useRouter();
  const [docId, setDocId] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState("POLICY");
  const [domain, setDomain] = useState("");
  const [reviewCadenceDays, setReviewCadenceDays] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    fetch("/api/governance/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        docId: docId.trim() || title.trim().replace(/\s+/g, "-").slice(0, 50),
        title: title.trim(),
        type,
        domain: domain.trim() || undefined,
        reviewCadenceDays: reviewCadenceDays ? parseInt(reviewCadenceDays, 10) : undefined,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.id) router.push(`/dashboard/governance/documents/${data.id}`);
        else setError(data.error ?? "Failed to create");
      })
      .catch(() => setError("Request failed"))
      .finally(() => setSubmitting(false));
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/governance/documents" className="text-sm text-[var(--color-gray-600)] hover:underline">
          ← Document control
        </Link>
        <h2 className="mt-1 text-xl font-semibold text-[var(--color-navy-primary)]">New document</h2>
        <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">Create a document in DRAFT; then upload a version and submit for approval.</p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-xl space-y-4 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        {error && (
          <p className="text-sm text-[var(--color-status-red)]">{error}</p>
        )}
        <div>
          <label className="block text-sm font-medium text-[var(--color-gray-700)]">Doc ID (short identifier) *</label>
          <input
            type="text"
            value={docId}
            onChange={(e) => setDocId(e.target.value)}
            required
            className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm"
            placeholder="e.g. AC-POL-001"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--color-gray-700)]">Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm"
            placeholder="Access Control Policy"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--color-gray-700)]">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm"
          >
            <option value="POLICY">Policy</option>
            <option value="SOP">SOP</option>
            <option value="PLAN">Plan</option>
            <option value="STANDARD">Standard</option>
            <option value="CHARTER">Charter</option>
            <option value="PROCEDURE">Procedure</option>
            <option value="TEMPLATE">Template</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--color-gray-700)]">Domain (optional)</label>
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm"
            placeholder="AC, AT, AU, …"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--color-gray-700)]">Review cadence (days, optional)</label>
          <input
            type="number"
            value={reviewCadenceDays}
            onChange={(e) => setReviewCadenceDays(e.target.value)}
            min={1}
            className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm"
            placeholder="365"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="rounded-[var(--radius-md)] bg-[var(--color-blue-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create document"}
          </button>
          <Link
            href="/dashboard/governance/documents"
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
