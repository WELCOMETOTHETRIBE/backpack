"use client";

import { useState, useEffect, useCallback } from "react";
import { ALL_CONTROL_IDS, getRequiredUploadArtifactLabels } from "@/lib/artifact-guide";
import { CONTROL_FAMILIES } from "@/components/governance-wizard/constants";
import { parseGovernanceFilename } from "@/lib/governance/document-naming";
import { X, ChevronDown, ChevronRight, FileUp } from "lucide-react";

const FAMILY_PREFIX: Record<string, string> = {
  AC: "3.1",
  AT: "3.2",
  AU: "3.3",
  CM: "3.4",
  IA: "3.5",
  IR: "3.6",
  MA: "3.7",
  MP: "3.8",
  PS: "3.9",
  PE: "3.10",
  RA: "3.11",
  CA: "3.12",
  SC: "3.13",
  SI: "3.14",
};

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
  const [activeFamily, setActiveFamily] = useState("AC");
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
        const firstId = parsed.controlIds[0];
        if (firstId) {
          const fam = CONTROL_FAMILIES.find((f) => firstId.startsWith(FAMILY_PREFIX[f.code] + "."));
          if (fam) setActiveFamily(fam.code);
        }
      }
    } else {
      setMappingInferredFromFilename(false);
    }
  }, [file?.name, records]);

  const familyControls: ControlOption[] = (() => {
    const prefix = FAMILY_PREFIX[activeFamily];
    if (!prefix) return [];
    const controlIds = ALL_CONTROL_IDS.filter((id) => id.startsWith(prefix + "."));
    const out: ControlOption[] = [];
    for (const controlId of controlIds) {
      const labels = getRequiredUploadArtifactLabels(controlId);
      if (labels.length === 0) continue;
      const rec = recordByControlId[controlId];
      if (!rec) continue;
      const n = nistByControlId[controlId];
      const firstLabel = labels[0];
      out.push({
        controlId,
        controlRecordId: rec.id,
        title: n?.title ?? null,
        nistDiscussionGuidance: n?.nistDiscussionGuidance ?? null,
        uploadLabels: labels,
        suggestedName: `${controlId.replace(".", "-")}-${slug(firstLabel)}-v1.pdf`,
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

        {/* Body: sidebar + scrollable content */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Left: family tabs */}
          <div
            className="flex w-16 shrink-0 flex-col border-r border-slate-200 bg-slate-50/80 py-2"
            aria-label="Control family"
          >
            {CONTROL_FAMILIES.map((f) => (
              <button
                key={f.code}
                type="button"
                onClick={() => setActiveFamily(f.code)}
                title={f.name}
                className={`border-l-2 py-2.5 text-center text-sm font-medium transition-colors ${
                  activeFamily === f.code
                    ? "border-[#3B82F6] bg-white text-[#3B82F6]"
                    : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {f.code}
              </button>
            ))}
          </div>

          {/* Right: scrollable main content */}
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
                  Select one or more controls to map this document to. Add file and metadata above, then choose controls below.
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

                {/* Map to controls */}
                <section>
                  <h3 className="mb-3 text-sm font-semibold text-slate-800">
                    Map to controls — {CONTROL_FAMILIES.find((f) => f.code === activeFamily)?.name ?? activeFamily}
                  </h3>
                  {familyControls.length === 0 ? (
                    <p className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-6 text-sm text-slate-500">
                      No controls in this family require upload artifacts.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {familyControls.map((opt) => (
                        <ControlRow
                          key={opt.controlRecordId}
                          opt={opt}
                          selected={selectedRecordIds.has(opt.controlRecordId)}
                          onToggle={() => toggleRecord(opt.controlRecordId)}
                        />
                      ))}
                    </ul>
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
