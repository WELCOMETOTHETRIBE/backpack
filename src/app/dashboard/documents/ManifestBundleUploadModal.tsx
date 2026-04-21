"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, X, FileJson, CheckCircle2, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";

type DetectedGovernance = {
  schema: string;
  docCount: number;
  runId: string | null;
  raw: Record<string, unknown>;
};

type DetectedOsV2 = {
  runId: string;
  computerName: string;
  collectedAt: string;
  fileCount: number;
  raw: Record<string, unknown>;
};

type Detected =
  | ({ kind: "governance" } & DetectedGovernance)
  | ({ kind: "os-v2" } & DetectedOsV2);

type IngestResult =
  | { kind: "governance"; doc_count: number; policy_satisfied_count: number; implemented_promoted: number; run_id: string }
  | { kind: "os-v2"; linked_controls: number; skipped_controls: number; collection_errors: number };

const GOV_SCHEMAS = ["mactech-governance-manifest.v1", "mactech.codex.manual.governance_manifest"];

function generateRunId() {
  const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return `GOV-${ts}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ManifestBundleUploadModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [detected, setDetected] = useState<Detected | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResult | null>(null);

  const reset = useCallback(() => {
    setDetected(null);
    setParseError(null);
    setSubmitError(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleFile = useCallback((file: File) => {
    reset();
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let text = e.target?.result as string;
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
        const json = JSON.parse(text);
        if (!json || typeof json !== "object") {
          setParseError("File does not contain a JSON object.");
          return;
        }
        const m = json as Record<string, unknown>;
        const schema = typeof m.schema === "string" ? m.schema : undefined;
        if (schema && GOV_SCHEMAS.includes(schema)) {
          const docs = Array.isArray(m.documents) ? m.documents : Array.isArray(m.docs) ? m.docs : [];
          setDetected({
            kind: "governance",
            schema,
            docCount: docs.length,
            runId: typeof m.run_id === "string" ? m.run_id : null,
            raw: m,
          });
          return;
        }
        if (schema === "cui-evidence.manifest.v2") {
          setDetected({
            kind: "os-v2",
            runId: typeof m.run_id === "string" ? m.run_id : "unknown",
            computerName: typeof m.computer_name === "string" ? m.computer_name : "unknown",
            collectedAt: typeof m.collected_at === "string" ? m.collected_at : "",
            fileCount: Array.isArray(m.files) ? m.files.length : 0,
            raw: m,
          });
          return;
        }
        setParseError(
          `Unrecognized manifest${schema ? ` (schema: "${schema}")` : ""}.\n\nAccepted:\n• mactech-governance-manifest.v1 (governance bundle)\n• cui-evidence.manifest.v2 (OS evidence)`
        );
      } catch {
        setParseError("Could not parse JSON — make sure you selected the correct manifest file.");
      }
    };
    reader.readAsText(file);
  }, [reset]);

  const handleSubmit = async () => {
    if (!detected) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (detected.kind === "governance") {
        const runId = detected.runId ?? generateRunId();
        const res = await fetch("/api/governance/ingest-manifest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ manifest: detected.raw, run_id: runId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setSubmitError(data.error ?? `Upload failed (${res.status})`);
          return;
        }
        setResult({
          kind: "governance",
          doc_count: data.doc_count ?? 0,
          policy_satisfied_count: data.policy_satisfied_count ?? 0,
          implemented_promoted: data.implemented_promoted ?? 0,
          run_id: data.run_id ?? runId,
        });
        router.refresh();
      } else {
        const res = await fetch("/api/evidence/v2/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ manifest: detected.raw }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setSubmitError(data.error ?? `Upload failed (${res.status})`);
          return;
        }
        setResult({
          kind: "os-v2",
          linked_controls: data.linked_controls ?? 0,
          skipped_controls: data.skipped_controls ?? 0,
          collection_errors: data.collection_errors ?? 0,
        });
        router.refresh();
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-gray-900)]">Upload manifest bundle</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--color-gray-400)] hover:bg-[var(--color-gray-100)] hover:text-[var(--color-gray-600)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {!detected && !result && (
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f) handleFile(f);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
                  dragOver
                    ? "border-indigo-400 bg-indigo-50"
                    : "border-[var(--color-border)] hover:border-[var(--color-gray-400)]"
                }`}
              >
                <div className="rounded-full bg-[var(--color-gray-100)] p-3">
                  <FileJson className="h-6 w-6 text-[var(--color-gray-400)]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--color-gray-800)]">
                    Drop a manifest bundle here
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-gray-500)]">or click to browse</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </div>
              <p className="text-xs text-[var(--color-gray-500)]">
                Accepted: <span className="font-mono">mactech-governance-manifest.v1</span> (governance bundle) or <span className="font-mono">cui-evidence.manifest.v2</span> (OS evidence bundle).
              </p>
            </>
          )}

          {parseError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-red-700">Unrecognized file</p>
                  <p className="mt-1 whitespace-pre-line text-xs text-red-700/80">{parseError}</p>
                  <button onClick={reset} className="mt-2 text-xs font-medium text-indigo-600 hover:underline">
                    Try a different file
                  </button>
                </div>
              </div>
            </div>
          )}

          {detected && !result && (
            <div className="rounded-2xl border border-[var(--color-border)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                    {detected.kind === "governance" ? "Governance bundle detected" : "OS evidence bundle detected"}
                  </p>
                  {detected.kind === "governance" ? (
                    <>
                      <p className="mt-2 text-sm font-semibold text-[var(--color-gray-900)]">
                        {detected.docCount} document{detected.docCount !== 1 ? "s" : ""} to register
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-[var(--color-gray-500)]">{detected.schema}</p>
                      {detected.runId && (
                        <p className="mt-0.5 font-mono text-xs text-[var(--color-gray-500)]">Run: {detected.runId}</p>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="mt-2 text-sm font-semibold text-[var(--color-gray-900)]">
                        {detected.fileCount} evidence file{detected.fileCount !== 1 ? "s" : ""}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-[var(--color-gray-500)]">{detected.computerName}</p>
                      <p className="mt-0.5 font-mono text-xs text-[var(--color-gray-500)]">Run: {detected.runId}</p>
                    </>
                  )}
                </div>
                <button onClick={reset} className="text-xs text-[var(--color-gray-400)] hover:text-[var(--color-gray-600)]">
                  Clear
                </button>
              </div>

              {submitError && (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  {submitError}
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  {submitting ? "Ingesting…" : "Ingest bundle"}
                </button>
                <button
                  onClick={reset}
                  className="rounded-2xl border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {result && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <p className="text-sm font-semibold text-emerald-800">Bundle ingested successfully</p>
              </div>
              {result.kind === "governance" && (
                <dl className="mt-3 grid grid-cols-3 gap-3">
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-emerald-700/70">Documents</dt>
                    <dd className="mt-0.5 text-xl font-bold text-emerald-900">{result.doc_count}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-emerald-700/70">Lanes satisfied</dt>
                    <dd className="mt-0.5 text-xl font-bold text-emerald-900">{result.policy_satisfied_count}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-emerald-700/70">Promoted</dt>
                    <dd className="mt-0.5 text-xl font-bold text-emerald-900">{result.implemented_promoted}</dd>
                  </div>
                </dl>
              )}
              {result.kind === "os-v2" && (
                <dl className="mt-3 grid grid-cols-3 gap-3">
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-emerald-700/70">Controls linked</dt>
                    <dd className="mt-0.5 text-xl font-bold text-emerald-900">{result.linked_controls}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-emerald-700/70">Skipped</dt>
                    <dd className="mt-0.5 text-xl font-bold text-emerald-900">{result.skipped_controls}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-emerald-700/70">Errors</dt>
                    <dd className="mt-0.5 text-xl font-bold text-emerald-900">{result.collection_errors}</dd>
                  </div>
                </dl>
              )}
              <div className="mt-4 flex gap-2">
                <button
                  onClick={onClose}
                  className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Done
                </button>
                <button
                  onClick={reset}
                  className="rounded-2xl border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                >
                  Upload another
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
