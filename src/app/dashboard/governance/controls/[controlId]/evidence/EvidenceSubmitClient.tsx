"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Requirement {
  id: string;
  title: string;
  description: string;
  type: string;
  inherited?: boolean;
  inheritedFrom?: string;
}

interface SubmittedEvidence {
  id: string;
  requirementId: string | null;
  evidenceType: string;
  description: string | null;
  fileUrl: string | null;
  sourceUrl: string | null;
  createdAt: string;
}

interface Props {
  controlId: string;
  controlRecordId: string | null;
  requirements: Requirement[];
  existingEvidence: SubmittedEvidence[];
  satisfiedIds: string[];
  technicalStatus: string;
  implementationStatus: string;
}

const TYPE_LABELS: Record<string, string> = {
  screenshot: "Screenshot",
  log_excerpt: "Log excerpt",
  config_export: "Config export",
  api_export: "API export",
  policy_config: "Policy config",
  tool_report: "Tool report",
};

function EvidenceTypeTag({ type }: { type: string }) {
  return (
    <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
      {TYPE_LABELS[type] ?? type}
    </span>
  );
}

function RequirementRow({
  req,
  satisfied,
  existingEntry,
  controlRecordId,
  onSubmitted,
}: {
  req: Requirement;
  satisfied: boolean;
  existingEntry: SubmittedEvidence | undefined;
  controlRecordId: string | null;
  onSubmitted: () => void;
}) {
  const [open, setOpen] = useState(!satisfied);
  const [mode, setMode] = useState<"file" | "reference">("reference");
  const [description, setDescription] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!controlRecordId) { setError("Control record not found for this org."); return; }
    if (mode === "reference" && !description.trim() && !sourceUrl.trim()) {
      setError("Provide a description or source URL."); return;
    }
    if (mode === "file" && !file) { setError("Select a file to upload."); return; }

    setSubmitting(true);
    setError(null);

    try {
      let res: Response;
      if (mode === "file" && file) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("controlRecordId", controlRecordId);
        fd.append("requirementId", req.id);
        fd.append("evidenceType", req.type);
        fd.append("description", description.trim() || req.title);
        res = await fetch("/api/technical-evidence", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/technical-evidence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            controlRecordId,
            requirementId: req.id,
            evidenceType: req.type,
            description: description.trim() || null,
            sourceUrl: sourceUrl.trim() || null,
          }),
        });
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Server error ${res.status}`);
        return;
      }
      onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`rounded-lg border ${satisfied ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800/30 dark:bg-emerald-950/10" : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"}`}>
      {/* Header */}
      <button
        className="flex w-full items-start gap-3 p-4 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${satisfied ? "bg-emerald-500" : "border-2 border-gray-300 dark:border-gray-600"}`}>
          {satisfied && (
            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium ${satisfied ? "text-emerald-800 dark:text-emerald-300" : "text-gray-900 dark:text-gray-100"}`}>
              {req.title}
            </span>
            <EvidenceTypeTag type={req.type} />
            {req.inherited && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                Inherited · {req.inheritedFrom}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{req.description}</p>
        </div>
        <svg
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded: existing submission or submit form */}
      {open && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 dark:border-gray-800">
          {satisfied && existingEntry ? (
            <div className="text-sm text-emerald-800 dark:text-emerald-300">
              <p className="font-medium">Evidence submitted</p>
              {existingEntry.description && <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">{existingEntry.description}</p>}
              {existingEntry.sourceUrl && (
                <a href={existingEntry.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 block text-xs underline">
                  {existingEntry.sourceUrl}
                </a>
              )}
              {existingEntry.fileUrl && (
                <a href={existingEntry.fileUrl} target="_blank" rel="noreferrer" className="mt-1 block text-xs underline">
                  View uploaded file
                </a>
              )}
              <p className="mt-1 text-xs text-emerald-600">Submitted {new Date(existingEntry.createdAt).toLocaleDateString()}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Mode toggle */}
              <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden w-fit text-xs font-medium">
                <button
                  onClick={() => setMode("reference")}
                  className={`px-3 py-1.5 ${mode === "reference" ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900" : "text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"}`}
                >
                  Reference / Attestation
                </button>
                <button
                  onClick={() => setMode("file")}
                  className={`px-3 py-1.5 ${mode === "file" ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900" : "text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"}`}
                >
                  Upload file
                </button>
              </div>

              {mode === "reference" ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                      Description / attestation note
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      placeholder={`Describe the evidence — e.g. "WAP configured with WPA3-Enterprise, RADIUS on NPS, screenshot archived in SharePoint security folder"`}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                      Source URL (optional — link to screenshot, portal page, or SharePoint doc)
                    </label>
                    <input
                      type="url"
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      placeholder="https://portal.azure.com/..."
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                    Upload file (screenshot, config export, log excerpt)
                  </label>
                  <input
                    type="file"
                    accept="image/*,.pdf,.txt,.csv,.json,.xml,.log,.docx,.xlsx"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="mt-1 block w-full text-xs text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-medium dark:text-gray-400 dark:file:bg-gray-800 dark:file:text-gray-300"
                  />
                  <div className="mt-2">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                      Description (optional)
                    </label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Brief description of what's in the file"
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                </div>
              )}

              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit evidence"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function EvidenceSubmitClient({
  controlId,
  controlRecordId,
  requirements,
  existingEvidence,
  satisfiedIds,
  technicalStatus,
  implementationStatus,
}: Props) {
  const router = useRouter();
  const satisfiedSet = new Set(satisfiedIds);
  const doneCount = requirements.filter((r) => satisfiedSet.has(r.id)).length;
  const allDone = doneCount === requirements.length || technicalStatus === "satisfied";

  const handleSubmitted = () => {
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {/* Progress header */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Technical Evidence Checklist</p>
            <p className="mt-0.5 text-xs text-gray-500">
              Submit evidence for each requirement below. Once all non-inherited requirements are satisfied, the
              technical lane closes and — if the governance document is also registered — this control promotes
              to <strong>Implemented</strong>.
            </p>
          </div>
          <div className="text-right">
            <p className={`text-2xl font-bold ${allDone ? "text-emerald-600" : "text-gray-900 dark:text-gray-100"}`}>
              {doneCount} <span className="text-base font-normal text-gray-400">/ {requirements.length}</span>
            </p>
            <p className="text-xs text-gray-500">requirements met</p>
          </div>
        </div>
        {allDone && implementationStatus !== "implemented" && (
          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-800/30 dark:bg-blue-950/20 dark:text-blue-300">
            Technical lane now satisfied. The control will promote to Implemented once status is recalculated — return to Governance to trigger recalculation.
          </div>
        )}
        {implementationStatus === "implemented" && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-800/30 dark:bg-emerald-950/20 dark:text-emerald-300">
            This control is fully implemented.
          </div>
        )}
      </div>

      {/* Requirement rows */}
      <div className="space-y-3">
        {requirements.map((req) => (
          <RequirementRow
            key={req.id}
            req={req}
            satisfied={satisfiedSet.has(req.id)}
            existingEntry={existingEvidence.find((e) => e.requirementId === req.id)}
            controlRecordId={controlRecordId}
            onSubmitted={handleSubmitted}
          />
        ))}
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Note: CUI artifacts are not stored in Trust Codex. Reference submissions (description + URL)
        record that the evidence exists and where it lives. File uploads are stored in your configured
        secure storage bucket.
      </p>
    </div>
  );
}
