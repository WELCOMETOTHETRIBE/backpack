"use client";

import { useState, useCallback, useRef } from "react";

interface Boundary {
  id: string;
  name: string;
}

interface ManifestPreview {
  schema: string;
  run_id: string;
  computer_name: string;
  collected_at: string;
  file_count: number;
  collection_errors: number;
  bundle_validation?: {
    files_ok: number;
    files_total: number;
    errors: string[];
  };
  // raw for submission
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any;
}

interface IngestResult {
  run_id: string;
  computer_name: string;
  collected_at: string;
  links_created: number;
  linked_controls: number;
  skipped_controls: number;
  collection_errors: number;
  collection_error_files: string[];
  freshness: "current" | "stale" | "expired";
  age_days: number;
  expires_at: string;
  bundle_validation?: {
    files_ok: number;
    files_total: number;
    errors: string[];
  } | null;
}

const EXPECTED_SCHEMA = "cui-evidence.manifest.v2";

function parseFreshnessDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function FreshnessBadge({ freshness }: { freshness: "current" | "stale" | "expired" }) {
  if (freshness === "current") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        Current
      </span>
    );
  }
  if (freshness === "stale") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Stale
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-400">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      Expired
    </span>
  );
}

export function UploadManifestClient({ boundaries }: { boundaries: Boundary[] }) {
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<ManifestPreview | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [selectedBoundaryId, setSelectedBoundaryId] = useState<string>(boundaries[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    setParseError(null);
    setPreview(null);
    setResult(null);
    setSubmitError(null);

    if (!file.name.endsWith(".json") && file.type !== "application/json") {
      setParseError("Only JSON files are accepted. Upload the meta/manifest.json from the evidence bundle.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setParseError("File exceeds 5 MB — upload manifest.json only, not the full evidence bundle.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const json = JSON.parse(e.target?.result as string) as any;

        if (json.schema !== EXPECTED_SCHEMA) {
          setParseError(
            `Unexpected schema: "${json.schema ?? "(none)"}". Expected "${EXPECTED_SCHEMA}". Make sure you're uploading meta/manifest.json from Collect-Cui-Evidence-v2.ps1.`
          );
          return;
        }
        if (!json.run_id || !json.computer_name || !json.collected_at) {
          setParseError("manifest.json is missing required fields (run_id, computer_name, collected_at).");
          return;
        }

        const files: Array<{ status?: string }> = Array.isArray(json.files) ? json.files : [];
        const collectionErrors = files.filter((f) => f.status === "collection_error").length;

        setPreview({
          schema: json.schema,
          run_id: json.run_id,
          computer_name: json.computer_name,
          collected_at: json.collected_at,
          file_count: files.length,
          collection_errors: collectionErrors,
          bundle_validation: json.bundle_validation,
          raw: json,
        });
      } catch {
        setParseError("Failed to parse JSON. Make sure the file is valid JSON.");
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleSubmit = async () => {
    if (!preview || !selectedBoundaryId) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/evidence/v2/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifest: preview.raw, boundary_id: selectedBoundaryId }),
      });

      const data = await res.json();
      if (!res.ok) {
        const code = data.code ?? "ERROR";
        const msg = data.error ?? "Ingest failed";
        if (res.status === 409) {
          setSubmitError(`This run has already been ingested (run_id: ${preview.run_id}). Each collection run can only be uploaded once.`);
        } else {
          setSubmitError(`${code}: ${msg}`);
        }
        return;
      }

      setResult(data as IngestResult);
      setPreview(null);
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

  // ── Result view ──────────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="space-y-6 py-4">
        <div className="rounded-xl border border-green-200 bg-green-50 p-5 dark:border-green-800 dark:bg-green-950/30">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500 text-white">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-green-900 dark:text-green-300">Evidence ingested successfully</p>
              <p className="mt-0.5 text-sm text-green-700 dark:text-green-400">
                {result.computer_name} &middot; run {result.run_id.slice(0, 8)}&hellip;
              </p>
            </div>
            <FreshnessBadge freshness={result.freshness} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Links created", value: result.links_created },
            { label: "Controls linked", value: result.linked_controls },
            { label: "Controls skipped", value: result.skipped_controls },
            { label: "Collection errors", value: result.collection_errors },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border bg-card p-3 text-center">
              <p className="text-2xl font-bold tabular-nums">{value}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        <div className="rounded-lg border bg-card p-4 text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Collected</span>
            <span className="font-medium">{parseFreshnessDate(result.collected_at)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Evidence age</span>
            <span className="font-medium">{result.age_days} days</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Expires</span>
            <span className="font-medium">{parseFreshnessDate(result.expires_at)}</span>
          </div>
          {result.bundle_validation && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bundle validation</span>
              <span className="font-medium">
                {result.bundle_validation.files_ok}/{result.bundle_validation.files_total} files OK
              </span>
            </div>
          )}
        </div>

        {result.collection_error_files.length > 0 && (
          <details className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
            <summary className="cursor-pointer text-sm font-medium text-amber-900 dark:text-amber-300">
              {result.collection_error_files.length} collection error{result.collection_error_files.length !== 1 ? "s" : ""} — evidence could not be gathered for these controls
            </summary>
            <ul className="mt-2 space-y-0.5 text-xs text-amber-800 dark:text-amber-400 font-mono">
              {result.collection_error_files.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </details>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={reset}
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Upload another manifest
          </button>
          <a
            href="/dashboard/os-baselines"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            View CUI Enclave
          </a>
        </div>
      </div>
    );
  }

  // ── Upload / Preview view ────────────────────────────────────────────────────
  return (
    <div className="space-y-6 py-4">
      <div>
        <h1 className="text-xl font-semibold">Upload Evidence Manifest</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload the <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">meta/manifest.json</code> produced by{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">Collect-Cui-Evidence-v2.ps1</code>. Evidence files stay on your
          VM — only the manifest (file paths + SHA-256 hashes) is transmitted.
        </p>
      </div>

      {/* Boundary selector */}
      {boundaries.length > 1 && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="boundary-select">
            System Boundary
          </label>
          <select
            id="boundary-select"
            value={selectedBoundaryId}
            onChange={(e) => setSelectedBoundaryId(e.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {boundaries.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {boundaries.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
          No system boundaries found.{" "}
          <a href="/dashboard/os-baselines" className="underline underline-offset-2">
            Create a boundary first
          </a>{" "}
          before uploading evidence.
        </div>
      )}

      {/* Drop zone */}
      {!preview && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors " +
            (dragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30")
          }
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <svg className="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <div>
            <p className="font-medium">Drop manifest.json here</p>
            <p className="mt-0.5 text-sm text-muted-foreground">or click to browse — JSON only, max 5 MB</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleFileInput}
          />
        </div>
      )}

      {/* Parse error */}
      {parseError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/20 dark:text-red-300">
          <p className="font-medium">Invalid manifest</p>
          <p className="mt-1">{parseError}</p>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold">Manifest preview</p>
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                {preview.schema}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Computer</span>
                <p className="font-medium mt-0.5">{preview.computer_name}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Run ID</span>
                <p className="font-medium font-mono text-xs mt-0.5 break-all">{preview.run_id}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Collected at</span>
                <p className="font-medium mt-0.5">{parseFreshnessDate(preview.collected_at)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Files</span>
                <p className="font-medium mt-0.5">
                  {preview.file_count} total
                  {preview.collection_errors > 0 && (
                    <span className="ml-1.5 text-amber-600 dark:text-amber-400">
                      ({preview.collection_errors} errors)
                    </span>
                  )}
                </p>
              </div>
            </div>

            {preview.bundle_validation && (
              <div className={
                "rounded-lg p-3 text-xs " +
                (preview.bundle_validation.errors.length > 0
                  ? "bg-amber-50 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300"
                  : "bg-green-50 text-green-800 dark:bg-green-950/20 dark:text-green-300")
              }>
                <p className="font-medium">
                  Bundle validation: {preview.bundle_validation.files_ok}/{preview.bundle_validation.files_total} files OK
                </p>
                {preview.bundle_validation.errors.length > 0 && (
                  <ul className="mt-1 font-mono space-y-0.5">
                    {preview.bundle_validation.errors.slice(0, 5).map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                    {preview.bundle_validation.errors.length > 5 && (
                      <li>…and {preview.bundle_validation.errors.length - 5} more</li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>

          {submitError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/20 dark:text-red-300">
              {submitError}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={reset}
              disabled={submitting}
              className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !selectedBoundaryId || boundaries.length === 0}
              className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Ingesting&hellip;
                </span>
              ) : (
                "Ingest manifest"
              )}
            </button>
          </div>
        </div>
      )}

      {/* Instructions */}
      {!preview && (
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer text-sm font-medium">How to get manifest.json from your CUI Vault VM</summary>
          <ol className="mt-3 space-y-2 text-sm text-muted-foreground list-decimal list-inside">
            <li>
              RDP or SSH into your Windows Server VM as a local administrator.
            </li>
            <li>
              Open PowerShell 5.1 as administrator and run:{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                .\Collect-Cui-Evidence-v2.ps1
              </code>
            </li>
            <li>
              When complete, the script prints the bundle path (e.g.{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                C:\CUI-Evidence\&lt;run-id&gt;\
              </code>
              ).
            </li>
            <li>
              Navigate to the bundle folder, open the{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">meta\</code> subfolder, and copy{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">manifest.json</code> to your workstation.
            </li>
            <li>Drop the file here to ingest it.</li>
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            The manifest contains only file paths and SHA-256 hashes — no CUI content leaves the VM.
          </p>
        </details>
      )}
    </div>
  );
}
