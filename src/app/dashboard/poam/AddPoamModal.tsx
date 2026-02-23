"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, Trash2 } from "lucide-react";

type ControlRecord = { id: string; controlId: string };

type MilestoneDraft = { title: string; dueDate: string };

export default function AddPoamModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [controlRecords, setControlRecords] = useState<ControlRecord[]>([]);
  const [loadingControls, setLoadingControls] = useState(false);
  const [controlRecordId, setControlRecordId] = useState("");
  const [weaknessDescription, setWeaknessDescription] = useState("");
  const [remediationPlan, setRemediationPlan] = useState("");
  const [scheduledCompletionDate, setScheduledCompletionDate] = useState("");
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([{ title: "", dueDate: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setError("");
      setLoadingControls(true);
      fetch("/api/control-records")
        .then((r) => (r.ok ? r.json() : []))
        .then((list: { id: string; controlId: string }[]) => {
          setControlRecords(Array.isArray(list) ? list : []);
          setControlRecordId("");
        })
        .finally(() => setLoadingControls(false));
    }
  }, [open]);

  function addMilestone() {
    setMilestones((m) => [...m, { title: "", dueDate: "" }]);
  }

  function removeMilestone(i: number) {
    setMilestones((m) => m.filter((_, idx) => idx !== i));
  }

  function setMilestone(i: number, field: "title" | "dueDate", value: string) {
    setMilestones((m) => {
      const next = [...m];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!controlRecordId.trim()) {
      setError("Select a NIST control.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/poam/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          controlRecordId: controlRecordId.trim(),
          weaknessDescription: weaknessDescription.trim() || undefined,
          remediationPlan: remediationPlan.trim() || undefined,
          scheduledCompletionDate: scheduledCompletionDate.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to create POA&M");
        return;
      }
      const entryId = data.id;
      const toAdd = milestones.filter((m) => m.title.trim());
      for (let i = 0; i < toAdd.length; i++) {
        await fetch(`/api/poam/entries/${entryId}/milestones`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: toAdd[i].title.trim(),
            dueDate: toAdd[i].dueDate.trim() || undefined,
          }),
        });
      }
      onClose();
      router.refresh();
      router.push(`/dashboard/poam/entry/${entryId}`);
    } catch {
      setError("Failed to create POA&M");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
        <div className="sticky top-0 flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
          <h2 className="text-lg font-semibold text-zinc-900">Add POA&M</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">NIST control *</label>
            <select
              value={controlRecordId}
              onChange={(e) => setControlRecordId(e.target.value)}
              required
              disabled={loadingControls}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 disabled:opacity-50"
            >
              <option value="">Select control</option>
              {controlRecords.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.controlId}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Weakness / finding</label>
            <textarea
              value={weaknessDescription}
              onChange={(e) => setWeaknessDescription(e.target.value)}
              rows={2}
              placeholder="Brief description of the gap or weakness"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Remediation plan</label>
            <textarea
              value={remediationPlan}
              onChange={(e) => setRemediationPlan(e.target.value)}
              rows={2}
              placeholder="How you will address this finding"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Target completion date</label>
            <input
              type="date"
              value={scheduledCompletionDate}
              onChange={(e) => setScheduledCompletionDate(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900"
            />
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-zinc-700">Tasks / milestones</label>
              <button
                type="button"
                onClick={addMilestone}
                className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
              >
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
            <div className="space-y-2">
              {milestones.map((m, i) => (
                <div key={i} className="flex gap-2 items-end">
                  <input
                    type="text"
                    value={m.title}
                    onChange={(e) => setMilestone(i, "title", e.target.value)}
                    placeholder="Task or milestone title"
                    className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                  />
                  <input
                    type="date"
                    value={m.dueDate}
                    onChange={(e) => setMilestone(i, "dueDate", e.target.value)}
                    className="w-36 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                  />
                  <button
                    type="button"
                    onClick={() => removeMilestone(i)}
                    className="rounded p-2 text-zinc-500 hover:bg-zinc-100 hover:text-red-600"
                    aria-label="Remove milestone"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create POA&M"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
