"use client";

import { useState, useEffect, useCallback } from "react";
import { getRequiredUploadArtifactLabels } from "@/lib/artifact-guide";
import { getControlIdsForDocument } from "@/lib/governance/governance-document-matrix";
import { parseGovernanceFilename } from "@/lib/governance/document-naming";
import { X, ChevronDown, ChevronRight, FileUp } from "lucide-react";

type ControlOption = {
  controlId: string;
  controlRecordId: string;
  title: string | null;
  nistDiscussionGuidance: string | null;
  uploadLabels: string[];
  suggestedName: string;
};

type NistRow = {
  controlId: string;
  title: string | null;
  nistDiscussionGuidance: string | null;
};

function slug(s: string): string {
  return s
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .slice(0, 40);
}

export function GovernanceDocumentUploadModal({
  onClose,
  onSaved,
  initialArtifactLabel,
}: {
  onClose: () => void;
  onSaved: (controlIdsMapped?: string[]) => void;
  initialArtifactLabel?: string;
}) {
  const [records, setRecords] = useState<{ id: string; controlId: string }[]>([]);
  const [nist, setNist] = useState<NistRow[]>([]);
  const [uploadedLabels, setUploadedLabels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState("");
  const [approvalDate, setApprovalDate] = useState("");
  const [artifactLabel, setArtifactLabel] = useState(initialArtifactLabel ?? "");
  const [uploading, setUploading] = useState(false);
  const [mappingInferredFromFilename, setMappingInferredFromFilename] = useState(false);

  useEffect(() => {
    if (initialArtifactLabel) setArtifactLabel(initialArtifactLabel);
  }, [initialArtifactLabel]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [recRes, nistRes, labelsRes] = await Promise.all([
        fetch("/api/control-records"),
        fetch("/api/controls/nist"),
        fetch("/api/governance-documents/uploaded-labels"),
      ]);
      if (recRes.ok) setRecords(await recRes.json());
      if (nistRes.ok) setNist(await nistRes.json());
      if (labelsRes.ok) {
        const d = await labelsRes.json().catch(() => ({}));
        setUploadedLabels(d.uploadedLabels ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const nistByControlId = Object.fromEntries(nist.map((n) => [n.controlId, n]));
  const recordByControlId = Object.fromEntries(records.map((r) => [r.controlId, r]));
  const recordById = Object.fromEntries(records.map((r) => [r.id, r]));

  // When file or records change, try to infer mapping from filename
  useEffect(() => {
    if (!file?.name || records.length === 0) return;
    const parsed = parseGovernanceFilename(file.name);
    if (parsed.controlIds.length > 0) {
      if (parsed.artifactLabel) setArtifactLabel(parsed.artifactLabel);
      const ids = parsed.controlIds.map((cid) => recordByControlId[cid]?.id).filter(Boolean) as string[];
      if (ids.length > 0) {
        setSelectedRecordIds(new Set(ids));
        setMappingInferredFromFilename(true);
      }
    } else {
      setMappingInferredFromFilename(false);
    }
  }, [file?.name, records]);

  // When artifact label changes, set controls satisfied by this document and pre-select them
  const labelTrimmed = artifactLabel.trim();
  useEffect(() => {
    if (!labelTrimmed || records.length === 0) return;
    const controlIds = getControlIdsForDocument(labelTrimmed);
    const ids = controlIds.map((cid) => recordByControlId[cid]?.id).filter(Boolean) as string[];
    setSelectedRecordIds((prev) => {
      const next = new Set(ids);
      if (next.size === 0) return prev;
      return next;
    });
  }, [labelTrimmed, records]);

  /** Controls that this document type satisfies — only these are shown and selectable. */
  const documentControls: ControlOption[] = (() => {
    if (!labelTrimmed) return [];
    const controlIds = getControlIdsForDocument(labelTrimmed);
    const out: ControlOption[] = [];
    for (const controlId of controlIds) {
      const rec = recordByControlId[controlId];
      if (!rec) continue;
      const labels = getRequiredUploadArtifactLabels(controlId);
      const n = nistByControlId[controlId];
      const firstLabel = labels[0];
      out.push({
        controlId,
        controlRecordId: rec.id,
        title: n?.title ?? null,
        nistDiscussionGuidance: n?.nistDiscussionGuidance ?? null,
        uploadLabels: labels,
        suggestedName: `${controlId.replace(".", "-")}-${slug(firstLabel ?? "document")}-v1.pdf`,
      });
    }
    return out;
  })();

  function toggleRecord(id: string) {
    setSelectedRecordIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleUpload() {
    if (!file || selectedRecordIds.size === 0 || !artifactLabel.trim()) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("artifactLabel", artifactLabel.trim());
      if (version) formData.set("version", version);
      if (approvalDate) formData.set("approvalDate", approvalDate);
      formData.set("controlRecordIds", JSON.stringify([...selectedRecordIds]));

      const res = await fetch("/api/artifacts", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const controlIdsMapped = [...selectedRecordIds].map((id) => recordById[id]?.controlId).filter(Boolean) as string[];
        onSaved(controlIdsMapped);
        setFile(null);
        setVersion("");
        setApprovalDate("");
        setArtifactLabel("");
        setSelectedRecordIds(new Set());
        setMappingInferredFromFilename(false);
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Wide modal: use most of viewport width/height, no truncation */}
      <div
        className="flex h-[min(90vh,42rem)] w-full max-w-[min(96vw,80rem)] min-w-0 flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
        style={{ minHeight: "28rem" }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-lg font-semibold text-slate-800">
            Governance Document Upload & Mapping
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body: scrollable content */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <p className="text-sm text-slate-500">Loading…</p>
              </div>
            ) : (
              <div className="flex flex-col gap-6 p-6">
                {mappingInferredFromFilename && (
                  <p className="rounded-lg border border-[var(--color-blue-accent)]/30 bg-[var(--color-blue-accent)]/5 px-3 py-2 text-sm text-slate-700">
                    Mapping inferred from filename. You can adjust below.
                  </p>
                )}
                <p className="text-sm text-slate-600">
                  Enter the document type above; the list below shows the controls this document satisfies and maps to.
                </p>

                {/* Upload form: compact grid */}
                <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <h3 className="mb-3 text-sm font-semibold text-slate-800">Document details</h3>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="sm:col-span-2">
                      <span className="block text-xs font-medium text-slate-700 mb-1">Document type (artifact label)</span>
                      <input
                        type="text"
                        value={artifactLabel}
                        onChange={(e) => setArtifactLabel(e.target.value)}
                        placeholder="e.g. Access Control Policy"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      />
                    </label>
                    <label>
                      <span className="block text-xs font-medium text-slate-700 mb-1">Version</span>
                      <input
                        type="text"
                        value={version}
                        onChange={(e) => setVersion(e.target.value)}
                        placeholder="v1"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      />
                    </label>
                    <label>
                      <span className="block text-xs font-medium text-slate-700 mb-1">Approval date</span>
                      <input
                        type="date"
                        value={approvalDate}
                        onChange={(e) => setApprovalDate(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      />
                    </label>
                    <label className="sm:col-span-2 lg:col-span-4">
                      <span className="block text-xs font-medium text-slate-700 mb-1">File</span>
                      <input
                        type="file"
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          setFile(f);
                          if (!f) setMappingInferredFromFilename(false);
                        }}
                        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-200 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-300"
                      />
                    </label>
                  </div>
                </section>

                {/* Controls satisfied by this document — only the list for this document type */}
                <section>
                  <h3 className="mb-3 text-sm font-semibold text-slate-800">
                    Controls satisfied by this document
                  </h3>
                  {!labelTrimmed ? (
                    <p className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-6 text-sm text-slate-500">
                      Enter a document type above (e.g. Access Control Policy) to see which controls this document satisfies and maps to.
                    </p>
                  ) : documentControls.length === 0 ? (
                    <p className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-6 text-sm text-slate-500">
                      No controls require &quot;{labelTrimmed}&quot;. Check the document type or choose another.
                    </p>
                  ) : (
                    <>
                      <p className="mb-3 text-xs text-slate-500">
                        This document type satisfies the following controls. All are selected by default; you can deselect if needed.
                      </p>
                      <ul className="space-y-2">
                        {documentControls.map((opt) => (
                          <ControlRow
                            key={opt.controlRecordId}
                            opt={opt}
                            selected={selectedRecordIds.has(opt.controlRecordId)}
                            onToggle={() => toggleRecord(opt.controlRecordId)}
                          />
                        ))}
                      </ul>
                    </>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>

        {/* Footer: always visible */}
        <div className="shrink-0 flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-white px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={
              uploading ||
              !file ||
              selectedRecordIds.size === 0 ||
              !artifactLabel.trim()
            }
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            <FileUp className="h-4 w-4" />
            {uploading ? "Uploading…" : "Upload & map"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Single control row with collapsible NIST guidance to avoid truncation and clutter */
function ControlRow({
  opt,
  selected,
  onToggle,
}: {
  opt: ControlOption;
  selected: boolean;
  onToggle: () => void;
}) {
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const hasGuidance = Boolean(opt.nistDiscussionGuidance?.trim());

  return (
    <li className="rounded-xl border border-slate-200 bg-slate-50/50 overflow-hidden">
      <label className="flex cursor-pointer items-start gap-4 p-4 min-w-0">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-[#3B82F6]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-mono text-sm font-semibold text-slate-800">{opt.controlId}</span>
            {opt.title && (
              <span className="text-sm text-slate-600">{opt.title}</span>
            )}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            Suggested filename: <span className="font-mono text-slate-600">{opt.suggestedName}</span>
          </p>
          {hasGuidance && (
            <div className="mt-3">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setGuidanceOpen((o) => !o);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#3B82F6] hover:underline"
              >
                {guidanceOpen ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                {guidanceOpen ? "Hide NIST guidance" : "Show NIST guidance"}
              </button>
              {guidanceOpen && (
                <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-100 bg-white px-3 py-2.5">
                  <p className="text-[13px] leading-relaxed text-slate-600 whitespace-pre-wrap">
                    {opt.nistDiscussionGuidance}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </label>
    </li>
  );
}
