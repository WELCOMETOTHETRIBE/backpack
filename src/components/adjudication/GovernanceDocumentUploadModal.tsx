"use client";

import { useState, useEffect, useCallback } from "react";
import { ALL_CONTROL_IDS, getRequiredUploadArtifactLabels } from "@/lib/artifact-guide";
import { CONTROL_FAMILIES } from "@/components/governance-wizard/constants";
import { X } from "lucide-react";

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
}: {
  onClose: () => void;
  onSaved: () => void;
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
  const [artifactLabel, setArtifactLabel] = useState("");
  const [uploading, setUploading] = useState(false);

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
        onSaved();
        setFile(null);
        setVersion("");
        setApprovalDate("");
        setArtifactLabel("");
        setSelectedRecordIds(new Set());
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
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
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

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex border-r border-slate-200">
            {CONTROL_FAMILIES.map((f) => (
              <button
                key={f.code}
                type="button"
                onClick={() => setActiveFamily(f.code)}
                className={`border-b-2 px-4 py-2.5 text-sm font-medium ${
                  activeFamily === f.code
                    ? "border-[#3B82F6] text-[#3B82F6]"
                    : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                {f.code}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {loading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : (
              <div className="space-y-6">
                <p className="text-sm text-slate-600">
                  Select one or more controls to map this document to. Suggested
                  filename and NIST guidance are shown below.
                </p>

                <div className="space-y-4">
                  <label className="block">
                    <span className="block text-xs font-medium text-slate-700">
                      Document type (artifact label)
                    </span>
                    <input
                      type="text"
                      value={artifactLabel}
                      onChange={(e) => setArtifactLabel(e.target.value)}
                      placeholder="e.g. Access Control Policy"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <div className="flex gap-4">
                    <label className="block">
                      <span className="block text-xs font-medium text-slate-700">
                        Version
                      </span>
                      <input
                        type="text"
                        value={version}
                        onChange={(e) => setVersion(e.target.value)}
                        placeholder="v1"
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-xs font-medium text-slate-700">
                        Approval date
                      </span>
                      <input
                        type="date"
                        value={approvalDate}
                        onChange={(e) => setApprovalDate(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="block text-xs font-medium text-slate-700">
                      File
                    </span>
                    <input
                      type="file"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      className="mt-1 block w-full text-sm text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
                    />
                  </label>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">
                    Map to controls ({activeFamily})
                  </h3>
                  <ul className="space-y-3">
                    {familyControls.map((opt) => (
                      <li
                        key={opt.controlRecordId}
                        className="rounded-lg border border-slate-200 bg-slate-50/50 p-3"
                      >
                        <label className="flex cursor-pointer items-start gap-3">
                          <input
                            type="checkbox"
                            checked={selectedRecordIds.has(opt.controlRecordId)}
                            onChange={() => toggleRecord(opt.controlRecordId)}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-[#3B82F6]"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="font-mono text-sm font-medium text-slate-800">
                              {opt.controlId}
                            </span>
                            {opt.title && (
                              <span className="ml-2 text-sm text-slate-600">
                                {opt.title}
                              </span>
                            )}
                            <p className="mt-1 text-xs text-slate-500">
                              Suggested: {opt.suggestedName}
                            </p>
                            {opt.nistDiscussionGuidance && (
                              <p className="mt-2 text-xs leading-relaxed text-slate-600">
                                {opt.nistDiscussionGuidance}
                              </p>
                            )}
                          </div>
                        </label>
                      </li>
                    ))}
                  </ul>
                  {familyControls.length === 0 && (
                    <p className="text-sm text-slate-500">
                      No controls in this family require upload artifacts.
                    </p>
                  )}
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
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
                    className="rounded-lg bg-[#0F172A] px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {uploading ? "Uploading…" : "Upload & map"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
