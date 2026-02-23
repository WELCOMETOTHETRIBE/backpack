"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

export default function RegisterEvidenceForm() {
  const router = useRouter();
  const [evidenceId, setEvidenceId] = useState("");
  const [runId, setRunId] = useState("");
  const [artifactFilename, setArtifactFilename] = useState("");
  const [storageLocation, setStorageLocation] = useState("");
  const [sha256Hash, setSha256Hash] = useState("");
  const [generatedDate, setGeneratedDate] = useState("");
  const [retentionUntil, setRetentionUntil] = useState("");
  const [regenerationInstructions, setRegenerationInstructions] = useState("");
  const [evidenceType, setEvidenceType] = useState<"enclave" | "governance">("enclave");
  const [controlImplementationIds, setControlImplementationIds] = useState<string[]>([]);
  const [controlOptions, setControlOptions] = useState<{ id: string; controlId: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/controls")
      .then((r) => (r.ok ? r.json() : null))
      .then((list: { id: string; control?: { controlId: string } }[] | null) => {
        if (Array.isArray(list)) {
          setControlOptions(list.map((c) => ({ id: c.id, controlId: c.control?.controlId ?? c.id })));
        }
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evidenceId: evidenceId || undefined,
          runId: runId || undefined,
          artifactFilename: artifactFilename || undefined,
          storageLocation: storageLocation || undefined,
          sha256Hash: sha256Hash || undefined,
          generatedDate: generatedDate || undefined,
          retentionUntil: retentionUntil || undefined,
          regenerationInstructions: regenerationInstructions || undefined,
          evidenceType,
          controlImplementationIds: controlImplementationIds.length ? controlImplementationIds : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = data.error ?? "Failed to register evidence";
        setMessage(errMsg);
        toast.error(errMsg);
        return;
      }
      setMessage("Registered.");
      toast.success("Evidence registered.");
      setEvidenceId("");
      setRunId("");
      setArtifactFilename("");
      setStorageLocation("");
      setSha256Hash("");
      setGeneratedDate("");
      setRetentionUntil("");
      setRegenerationInstructions("");
      setControlImplementationIds([]);
      router.refresh();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Failed to register evidence";
      setMessage(errMsg);
      toast.error(errMsg);
    } finally {
      setSaving(false);
    }
  }

  function toggleControl(id: string) {
    setControlImplementationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mb-8 rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="mb-4 font-medium text-zinc-800">Register evidence (metadata only)</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm text-zinc-600">Evidence ID (unique)</label>
          <input
            type="text"
            value={evidenceId}
            onChange={(e) => setEvidenceId(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-600">RunId</label>
          <input
            type="text"
            value={runId}
            onChange={(e) => setRunId(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-600">Artifact filename</label>
          <input
            type="text"
            value={artifactFilename}
            onChange={(e) => setArtifactFilename(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-600">Storage location (e.g. C:\\evidence\\...)</label>
          <input
            type="text"
            value={storageLocation}
            onChange={(e) => setStorageLocation(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-600">SHA-256 hash (required for enclave)</label>
          <input
            type="text"
            value={sha256Hash}
            onChange={(e) => setSha256Hash(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2 font-mono text-sm text-zinc-900"
            placeholder="64 hex chars"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-600">Evidence type</label>
          <select
            value={evidenceType}
            onChange={(e) => setEvidenceType(e.target.value as "enclave" | "governance")}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900"
          >
            <option value="enclave">Enclave (hash required)</option>
            <option value="governance">Governance</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-600">Generated date</label>
          <input
            type="date"
            value={generatedDate}
            onChange={(e) => setGeneratedDate(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-600">Retention until</label>
          <input
            type="date"
            value={retentionUntil}
            onChange={(e) => setRetentionUntil(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900"
            required
          />
        </div>
      </div>
      <div className="mt-4">
        <label className="mb-1 block text-sm text-zinc-600">Regeneration instructions</label>
        <textarea
          value={regenerationInstructions}
          onChange={(e) => setRegenerationInstructions(e.target.value)}
          rows={2}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900"
        />
      </div>
      <div className="mt-4">
        <label className="mb-1 block text-sm text-zinc-600">Link to controls (optional)</label>
        <div className="max-h-32 overflow-y-auto rounded border border-zinc-200 p-2">
          {controlOptions.slice(0, 50).map((c) => (
            <label key={c.id} className="mr-4 inline-flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={controlImplementationIds.includes(c.id)}
                onChange={() => toggleControl(c.id)}
              />
              {c.controlId}
            </label>
          ))}
        </div>
      </div>
      {message && <p className="mt-2 text-sm text-zinc-600">{message}</p>}
      <button
        type="submit"
        disabled={saving}
        className="mt-4 rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Register evidence"}
      </button>
    </form>
  );
}
