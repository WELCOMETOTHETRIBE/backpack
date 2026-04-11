"use client";

import { useState, useCallback, useRef } from "react";

const SCHEMA_V1 = "mactech-governance-manifest.v1";
const SCHEMA_LEGACY = "mactech.codex.manual.governance_manifest";
const SUPPORTED_SCHEMAS = [SCHEMA_V1, SCHEMA_LEGACY];

interface ManifestPreview {
  schema: string;
  version?: number;
  run_id: string | null; // embedded in v1, generated for legacy
  bundle_source?: string;
  doc_count: number;
  kinds: Record<string, number>;
  status_counts: Record<string, number>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any;
}

interface IngestResult {
  run_id: string;
  schema: string;
  doc_count: number;
  linked_controls: number;
  policy_satisfied_count: number;
  manifest_run_id: string;
}

function parseManifest(json: unknown): ManifestPreview | null {
  if (!json || typeof json !== "object") return null;
  const m = json as Record<string, unknown>;
  const schema = m.schema as string;
  if (!SUPPORTED_SCHEMAS.includes(schema)) return null;

  const kinds: Record<string, number> = {};
  const status_counts: Record<string, number> = {};

  if (schema === SCHEMA_V1) {
    if (!Array.isArray(m.documents)) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const doc of m.documents as any[]) {
      const k = doc.document_type ?? "unknown";
      kinds[k] = (kinds[k] ?? 0) + 1;
      const s = doc.status ?? "unknown";
      status_counts[s] = (status_counts[s] ?? 0) + 1;
    }
    return {
      schema,
      version: 1,
      run_id: (m.run_id as string) ?? null,
      bundle_source: m.source as string | undefined,
      doc_count: (m.documents as unknown[]).length,
      kinds,
      status_counts,
      raw: json,
    };
  }

  // Legacy schema
  if (!Array.isArray(m.docs)) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const doc of m.docs as any[]) {
    const k = doc.kind ?? "unknown";
    kinds[k] = (kinds[k] ?? 0) + 1;
  }
  return {
    schema,
    version: typeof m.version === "number" ? m.version : undefined,
    run_id: (m.run_id as string) ?? null,
    bundle_source: (m.source as Record<string, string> | undefined)?.bundle,
    doc_count: (m.docs as unknown[]).length,
    kinds,
    status_counts: {},
    raw: json,
  };
}

function generateRunId(): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  return `GOV-${ts}-${rand}`;
}

export default function UploadGovernanceClient() {
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<ManifestPreview | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    setParseError(null);
    setPreview(null);
    setResult(null);
    setSubmitError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        const p = parseManifest(json);
        if (!p) {
          const got = (json as Record<string, unknown>)?.schema ?? "unknown";
          setParseError(
            `Unsupported manifest schema "${got}". Upload either:\n• ${SCHEMA_V1}  (QMS CLI output)\n• ${SCHEMA_LEGACY}  (legacy bundle)`
          );
          return;
        }
        setPreview(p);
      } catch {
        setParseError("Could not parse JSON. Make sure you uploaded the manifest.json file.");
      }
    };
    reader.readAsText(file);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleSubmit = async () => {
    if (!preview) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      // v1 manifests embed run_id; legacy needs one generated
      const runId = preview.run_id ?? generateRunId();
      const res = await fetch("/api/governance/ingest-manifest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifest: preview.raw, run_id: runId }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? `Server error: ${res.status}`);
        return;
      }
      setResult(data as IngestResult);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setPreview(null);
    setResult(null);
    setParseError(null);
    setSubmitError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      {!preview && !result && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-12 text-center transition-colors " +
            (dragOver
              ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
              : "border-gray-300 hover:border-gray-400 dark:border-gray-700 dark:hover:border-gray-600")
          }
        >
          <div className="rounded-full bg-gray-100 p-4 dark:bg-gray-800">
            <svg className="h-8 w-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Drop <span className="font-mono text-blue-600 dark:text-blue-400">governance-manifest-cmmc20.json</span> here
            </p>
            <p className="mt-1 text-xs text-gray-500">
              QMS CLI output (<span className="font-mono">mactech-governance-manifest.v1</span>) or legacy bundle manifest
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={onFileChange}
          />
        </div>
      )}

      {/* Parse error */}
      {parseError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800/40 dark:bg-red-950/20">
          <p className="text-sm font-medium text-red-800 dark:text-red-400">Invalid manifest</p>
          <p className="mt-1 text-xs text-red-700 dark:text-red-300">{parseError}</p>
          <button onClick={reset} className="mt-3 text-xs font-medium text-red-600 underline hover:no-underline">
            Try again
          </button>
        </div>
      )}

      {/* Preview */}
      {preview && !result && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Manifest Preview</h3>
            <button onClick={reset} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              Clear
            </button>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Schema</dt>
              <dd className="mt-0.5 font-mono text-xs text-gray-800 dark:text-gray-200 break-all">{preview.schema}</dd>
            </div>
            {preview.version !== undefined && (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Version</dt>
                <dd className="mt-0.5 text-gray-800 dark:text-gray-200">{preview.version}</dd>
              </div>
            )}
            {preview.bundle_source && (
              <div className="col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Bundle Source</dt>
                <dd className="mt-0.5 font-mono text-xs text-gray-700 dark:text-gray-300 break-all">{preview.bundle_source}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Documents</dt>
              <dd className="mt-0.5 text-xl font-bold text-gray-900 dark:text-gray-100">{preview.doc_count}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Document Types</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {Object.entries(preview.kinds).map(([kind, count]) => (
                  <span key={kind} className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                    {kind} &times; {count}
                  </span>
                ))}
              </dd>
            </div>
            {Object.keys(preview.status_counts).length > 0 && (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Approval Status</dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {Object.entries(preview.status_counts).map(([s, count]) => {
                    const color =
                      s === "approved" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : s === "in_review" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
                    return (
                      <span key={s} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
                        {s} &times; {count}
                      </span>
                    );
                  })}
                </dd>
                {(preview.status_counts["draft"] ?? 0) > 0 && (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    Draft documents will NOT satisfy policy lanes — promote to in_review or approved first.
                  </p>
                )}
              </div>
            )}
            {preview.run_id && (
              <div className="col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Run ID (embedded)</dt>
                <dd className="mt-0.5 font-mono text-xs text-gray-700 dark:text-gray-300">{preview.run_id}</dd>
              </div>
            )}
          </dl>

          {submitError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800/40 dark:bg-red-950/20 dark:text-red-300">
              {submitError}
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Ingesting...
                </>
              ) : "Ingest Manifest"}
            </button>
            <button onClick={reset} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-6 dark:border-green-800/40 dark:bg-green-950/20">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-green-100 p-1.5 dark:bg-green-900/40">
              <svg className="h-5 w-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-medium text-green-900 dark:text-green-300">Manifest ingested successfully</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-green-700 dark:text-green-400">Run ID</dt>
                  <dd className="mt-0.5 font-mono text-xs text-green-900 dark:text-green-200 break-all">{result.run_id}</dd>
                </div>
                <div>
                  <dt className="text-xs text-green-700 dark:text-green-400">Documents</dt>
                  <dd className="mt-0.5 text-xl font-bold text-green-900 dark:text-green-200">{result.doc_count}</dd>
                </div>
                <div>
                  <dt className="text-xs text-green-700 dark:text-green-400">Controls Linked</dt>
                  <dd className="mt-0.5 text-xl font-bold text-green-900 dark:text-green-200">{result.linked_controls}</dd>
                </div>
                <div>
                  <dt className="text-xs text-green-700 dark:text-green-400">Policy Lanes Satisfied</dt>
                  <dd className="mt-0.5 text-xl font-bold text-green-900 dark:text-green-200">{result.policy_satisfied_count}</dd>
                </div>
              </dl>
              <button onClick={reset} className="mt-4 text-xs font-medium text-green-700 underline hover:no-underline dark:text-green-400">
                Upload another manifest
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
