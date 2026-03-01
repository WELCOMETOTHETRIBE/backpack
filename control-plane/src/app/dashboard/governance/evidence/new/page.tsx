"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewEvidencePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [evidenceType, setEvidenceType] = useState("screenshot");
  const [sourceSystem, setSourceSystem] = useState("");
  const [validityPeriodDays, setValidityPeriodDays] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    fetch("/api/governance/evidence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        evidenceType,
        sourceSystem: sourceSystem.trim() || undefined,
        validityPeriodDays: validityPeriodDays ? parseInt(validityPeriodDays, 10) : undefined,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.id) router.push(`/dashboard/governance/evidence/${data.id}`);
        else setError(data.error ?? "Failed to create");
      })
      .catch(() => setError("Request failed"))
      .finally(() => setSubmitting(false));
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/governance/evidence" className="text-sm text-[var(--color-gray-600)] hover:underline">
          ← Evidence library
        </Link>
        <h2 className="mt-1 text-xl font-semibold text-[var(--color-navy-primary)]">Add evidence</h2>
      </div>

      <form onSubmit={handleSubmit} className="max-w-xl space-y-4 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        {error && <p className="text-sm text-[var(--color-status-red)]">{error}</p>}
        <div>
          <label className="block text-sm font-medium text-[var(--color-gray-700)]">Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--color-gray-700)]">Type</label>
          <select
            value={evidenceType}
            onChange={(e) => setEvidenceType(e.target.value)}
            className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm"
          >
            <option value="screenshot">Screenshot</option>
            <option value="export_file">Export file</option>
            <option value="log_snippet">Log snippet</option>
            <option value="config_baseline">Config baseline</option>
            <option value="policy_export">Policy export</option>
            <option value="ticket">Ticket</option>
            <option value="training_record">Training record</option>
            <option value="incident_report">Incident report</option>
            <option value="risk_report">Risk report</option>
            <option value="attestation">Attestation</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--color-gray-700)]">Source system (optional)</label>
          <input
            type="text"
            value={sourceSystem}
            onChange={(e) => setSourceSystem(e.target.value)}
            className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--color-gray-700)]">Validity period (days, optional)</label>
          <input
            type="number"
            value={validityPeriodDays}
            onChange={(e) => setValidityPeriodDays(e.target.value)}
            min={1}
            className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-[var(--radius-md)] bg-[var(--color-blue-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create"}
          </button>
          <Link href="/dashboard/governance/evidence" className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
