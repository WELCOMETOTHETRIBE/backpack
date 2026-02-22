"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

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
  const [generating, setGenerating] = useState(false);
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
        <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">Implementation narrative</label>
          <button
            type="button"
            onClick={async () => {
              setGenerating(true);
              setMessage("");
              try {
                const res = await fetch("/api/ai/generate-narrative", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ controlId: implementationId }),
                });
                if (!res.ok) {
                  const d = await res.json().catch(() => ({}));
                  setMessage(d.error ?? "Generation failed");
                  return;
                }
                const data = await res.json();
                setNarrative(data.narrative || "");
                setMessage("Narrative generated. Review and edit as needed.");
              } catch (err) {
                setMessage("Failed to generate narrative");
              } finally {
                setGenerating(false);
              }
            }}
            disabled={generating}
            className="flex items-center gap-2 rounded-md bg-[#3B82F6] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2563EB] disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {generating ? "Generating..." : "Generate with AI"}
          </button>
        </div>
        <textarea
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          rows={6}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
          placeholder="Describe how this control is implemented in your organization..."
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
      {message && (
        <p className={`text-sm ${message.includes("error") || message.includes("Failed") ? "text-[#EF4444]" : "text-[#10B981]"}`}>
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-[#0F172A] px-4 py-2 text-sm font-medium text-white hover:bg-[#1E293B] disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save Changes"}
      </button>
    </form>
  );
}
