"use client";

import { useState } from "react";

type Props = {
  implementationId: string;
  initialStatus: string;
  initialNarrative: string | null;
  initialCadence: string | null;
  initialLastValidation: string | null;
  initialPolicySopRefs: string | null;
};

const STATUS_OPTIONS = ["Not Started", "Implemented", "Partial", "POA&M", "Inherited", "Not Applicable"];
const CADENCE_OPTIONS = ["Quarterly", "Monthly", "Annual"];

export default function ControlDetailForm({
  implementationId,
  initialStatus,
  initialNarrative,
  initialCadence,
  initialLastValidation,
  initialPolicySopRefs,
}: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [narrative, setNarrative] = useState(initialNarrative ?? "");
  const [cadence, setCadence] = useState(initialCadence ?? "");
  const [lastValidation, setLastValidation] = useState(
    initialLastValidation ? initialLastValidation.slice(0, 10) : ""
  );
  const [policySopRefs, setPolicySopRefs] = useState(initialPolicySopRefs ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/controls/${implementationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: status || undefined,
          implementationNarrative: narrative || undefined,
          monitoringCadence: cadence || undefined,
          lastValidationDate: lastValidation ? `${lastValidation}T00:00:00.000Z` : undefined,
          policySopRefs: policySopRefs || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setMessage(d.error ?? "Update failed");
        return;
      }
      setMessage("Saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="font-medium text-zinc-800">Implementation</h2>
      <div>
        <label className="mb-1 block text-sm text-zinc-600">Status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm text-zinc-600">Implementation narrative</label>
        <textarea
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          rows={4}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-zinc-600">Monitoring cadence</label>
        <select
          value={cadence}
          onChange={(e) => setCadence(e.target.value)}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900"
        >
          <option value="">—</option>
          {CADENCE_OPTIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm text-zinc-600">Last validation date</label>
        <input
          type="date"
          value={lastValidation}
          onChange={(e) => setLastValidation(e.target.value)}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-zinc-600">Policy / SOP refs</label>
        <input
          type="text"
          value={policySopRefs}
          onChange={(e) => setPolicySopRefs(e.target.value)}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900"
        />
      </div>
      {message && <p className="text-sm text-zinc-600">{message}</p>}
      <button
        type="submit"
        disabled={saving}
        className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
