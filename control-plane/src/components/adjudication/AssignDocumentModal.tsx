"use client";

import { useState, useEffect, useCallback } from "react";
import { ALL_CONTROL_IDS, getRequiredUploadArtifactLabels } from "@/lib/artifact-guide";
import { X, FileText } from "lucide-react";

type GovernanceDoc = {
  id: string;
  docId: string;
  title: string;
  type: string;
  status: string;
};

export function AssignDocumentModal({
  artifactLabel,
  onClose,
  onSaved,
}: {
  artifactLabel: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [docs, setDocs] = useState<GovernanceDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/governance/documents?limit=100");
      if (!res.ok) throw new Error("Failed to load documents");
      const data = await res.json();
      setDocs(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  async function handleAssign() {
    if (!selectedId) return;
    setAssigning(true);
    setError(null);
    try {
      const recordsRes = await fetch("/api/control-records");
      if (!recordsRes.ok) throw new Error("Failed to load control records");
      const records: { id: string; controlId: string }[] = await recordsRes.json();
      const controlIdsNeedingLabel = ALL_CONTROL_IDS.filter((cid) =>
        getRequiredUploadArtifactLabels(cid).includes(artifactLabel)
      );
      const recordIds = records
        .filter((r) => controlIdsNeedingLabel.includes(r.controlId))
        .map((r) => ({ controlId: r.controlId }));

      for (const { controlId } of recordIds) {
        const putRes = await fetch("/api/control-records/artifacts", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            control_id: controlId,
            artifact_label: artifactLabel,
            artifact_type: "REFERENCE",
            value_text: JSON.stringify({ governanceDocumentId: selectedId }),
          }),
        });
        if (!putRes.ok) {
          const err = await putRes.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? "Failed to assign");
        }
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assign failed");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-doc-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 id="assign-doc-title" className="text-lg font-semibold text-slate-800">
            Assign from Document Control
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-4 py-3 text-sm text-slate-600">
          Assign an existing document to &quot;{artifactLabel}&quot; for all relevant controls.
        </div>
        {error && (
          <div className="mx-4 mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="max-h-[50vh] overflow-y-auto px-4 pb-4">
          {loading ? (
            <p className="py-6 text-center text-sm text-slate-500">Loading documents…</p>
          ) : docs.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No documents in Document Control. Upload or create one first.</p>
          ) : (
            <ul className="space-y-1">
              {docs.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(selectedId === doc.id ? null : doc.id)}
                    className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      selectedId === doc.id
                        ? "border-[var(--color-blue-accent)] bg-blue-50"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <FileText className="h-4 w-4 shrink-0 text-slate-500" />
                    <span className="min-w-0 flex-1 font-medium text-slate-900 truncate">{doc.title}</span>
                    <span className="shrink-0 rounded px-1.5 py-0.5 text-xs text-slate-500">{doc.type}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAssign}
            disabled={!selectedId || assigning}
            className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
          >
            {assigning ? "Assigning…" : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}
