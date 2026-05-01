"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface Boundary {
  id: string;
  name: string;
}

interface IngestHistoryRow {
  run_id: string;
  computer_name: string | null;
  collected_at: string | null;
  ingested_at: string;
  expires_at: string | null;
  links_total: number;
  files_ok: number;
  collection_errors: number;
  controls_linked: number;
  freshness: "current" | "stale" | "expired" | "unknown";
}

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days <= 0) return d.toLocaleString();
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

function IngestHistory({
  history,
  loading,
  onRefresh,
}: {
  history: IngestHistoryRow[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Evidence upload history</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Past manifest ingests for this org. Expand a run to see file/error details.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {loading && history.length === 0 ? (
        <div className="mt-4 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : history.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-center text-xs text-gray-500">
          No ingests yet. Upload a manifest above to get started.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {history.map((row) => {
            const badge = historyStatusBadge(row);
            const isOpen = open === row.run_id;
            return (
              <li
                key={row.run_id}
                className="rounded-2xl border border-gray-200 bg-white"
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : row.run_id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 rounded-2xl"
                >
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                    {badge.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {row.computer_name ?? "Unknown host"}
                      <span className="ml-2 font-mono text-[11px] text-gray-400">
                        {row.run_id.slice(0, 8)}…
                      </span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {row.collected_at
                        ? `Collected ${formatRelativeDate(row.collected_at)}`
                        : `Ingested ${formatRelativeDate(row.ingested_at)}`}
                      {" · "}
                      {row.controls_linked} control{row.controls_linked === 1 ? "" : "s"} · {row.links_total} file{row.links_total === 1 ? "" : "s"}
                      {row.collection_errors > 0 && (
                        <span className="ml-1 text-amber-700">({row.collection_errors} error{row.collection_errors === 1 ? "" : "s"})</span>
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-gray-400">
                    {isOpen ? "Hide" : "Details"}
                  </span>
                </button>
                {isOpen && (
                  <dl className="border-t border-gray-100 bg-gray-50 px-4 py-3 text-xs grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-b-2xl">
                    <div className="flex justify-between col-span-2">
                      <dt className="text-gray-500">Run ID</dt>
                      <dd className="font-mono text-gray-700 break-all text-right">{row.run_id}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Ingested</dt>
                      <dd className="font-medium text-gray-800">{new Date(row.ingested_at).toLocaleString()}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Collected</dt>
                      <dd className="font-medium text-gray-800">
                        {row.collected_at ? new Date(row.collected_at).toLocaleString() : "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Files ok</dt>
                      <dd className="font-semibold text-emerald-700">{row.files_ok}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Collection errors</dt>
                      <dd className={`font-semibold ${row.collection_errors > 0 ? "text-red-600" : "text-gray-700"}`}>
                        {row.collection_errors}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Expires</dt>
                      <dd className="font-medium text-gray-800">
                        {row.expires_at ? new Date(row.expires_at).toLocaleDateString() : "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Freshness</dt>
                      <dd className="font-medium text-gray-800 capitalize">{row.freshness}</dd>
                    </div>
                  </dl>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function historyStatusBadge(row: IngestHistoryRow) {
  if (row.collection_errors > 0 && row.files_ok === 0) {
    return { label: "Errors", cls: "bg-red-100 text-red-700 border-red-200", dot: "bg-red-500" };
  }
  if (row.collection_errors > 0) {
    return { label: "Partial", cls: "bg-amber-100 text-amber-800 border-amber-200", dot: "bg-amber-500" };
  }
  if (row.freshness === "expired") {
    return { label: "Expired", cls: "bg-gray-100 text-gray-600 border-gray-200", dot: "bg-gray-400" };
  }
  if (row.freshness === "stale") {
    return { label: "Stale", cls: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400" };
  }
  return { label: "Pass", cls: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" };
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
  /** Per-control validator findings written when validation-report.json was bundled. */
  validator_findings?: number;
  freshness: "current" | "stale" | "expired";
  age_days: number;
  expires_at: string;
  bundle_validation?: {
    files_ok: number;
    files_total: number;
    errors: string[];
  } | null;
}

/**
 * Optional companion to the manifest. When the user drops the OS validator
 * report (validation-report.json from Test-CuiHardening.ps1) alongside or
 * after the manifest, we POST it with the manifest so the codex records
 * per-check PASS/FAIL state in evidenceFindings (same table as the Azure
 * validator). Schema-detected via summary.computer + checks[] shape.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ValidationReport = any;

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
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  // Cloud validator report (validate_azure_entra v1.5+) routes through a
  // different ingest endpoint than the OS bundle, so it gets its own slot.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [cloudReport, setCloudReport] = useState<any | null>(null);
  const [cloudSubmitting, setCloudSubmitting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [selectedBoundaryId, setSelectedBoundaryId] = useState<string>(boundaries[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [history, setHistory] = useState<IngestHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/evidence/v2/ingest/history", { cache: "no-store" });
      if (res.ok) setHistory((await res.json()) as IngestHistoryRow[]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => { void loadHistory(); }, [loadHistory]);
  useEffect(() => { if (result) void loadHistory(); }, [result, loadHistory]);

  const processFile = useCallback((file: File) => {
    setParseError(null);
    setResult(null);
    setSubmitError(null);

    if (!file.name.endsWith(".json") && file.type !== "application/json") {
      setParseError("Only JSON files are accepted. Upload meta/manifest.json (and optionally the OS validator's validation-report.json).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setParseError("File exceeds 5 MB -- upload manifest.json or validation-report.json only, not the full evidence bundle.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const json = JSON.parse(e.target?.result as string) as any;

        // Detect file type by shape -- the page accepts THREE distinct files:
        //
        //   1. OS manifest.json
        //      schema === "cui-evidence.manifest.v2"
        //
        //   2. OS validation-report.json (from Test-CuiHardening.ps1)
        //      has summary.pass_count + checks[]; NO validator.name field
        //
        //   3. Cloud validation-report-azure-entra.json (validate_azure_entra v1.5+)
        //      has validator.name === "validate_azure_entra" + checks[]
        //      (Routes through a different ingest endpoint than the OS bundle)
        const isManifest = json.schema === EXPECTED_SCHEMA;
        const isCloudReport =
          json.validator?.name === "validate_azure_entra" &&
          Array.isArray(json.checks);
        const isOsValidationReport =
          !json.schema &&
          !isCloudReport &&
          json.summary &&
          Array.isArray(json.checks);

        if (isCloudReport) {
          setCloudReport(json);
          return;
        }

        if (isOsValidationReport) {
          // Forgiving: accept the OS validator report regardless of whether
          // the manifest is loaded yet. Drop order shouldn't matter -- we
          // surface a friendly status hint in the UI block, never an error.
          setValidationReport(json);
          return;
        }

        if (!isManifest) {
          setParseError(
            `Unexpected file shape. This page accepts: (1) OS manifest.json (schema "${EXPECTED_SCHEMA}"), (2) OS validation-report.json from Test-CuiHardening, or (3) Cloud validation-report-azure-entra.json from validate_azure_entra v1.5+.`
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
  }, [preview]);

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
        body: JSON.stringify({
          manifest: preview.raw,
          boundary_id: selectedBoundaryId,
          // Optional: when the user dropped validation-report.json alongside,
          // ship it so the codex records per-check PASS/FAIL findings.
          ...(validationReport ? { validation_report: validationReport } : {}),
        }),
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
      setValidationReport(null);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloudSubmit = async () => {
    if (!cloudReport || !selectedBoundaryId) return;
    setCloudSubmitting(true);
    setSubmitError(null);
    try {
      const runId =
        cloudReport.run_id ?? `cloud-${Date.now()}`;
      const collectedAt =
        cloudReport.generated_utc ?? new Date().toISOString();
      const res = await fetch(
        `/api/os-baselines/boundaries/${selectedBoundaryId}/evidence-runs/import-report`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            run_id: runId,
            collected_at: collectedAt,
            report: cloudReport,
            // Re-uploads of the same content (same fingerprint) overwrite
            // the prior run instead of 409'ing. Re-running the validator and
            // uploading again is a normal user workflow; making them edit
            // the report to bypass dedup would be silly.
            replace_existing: true,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(`Cloud ingest failed: ${data.error ?? res.statusText}`);
        return;
      }
      // Render a minimal IngestResult-shaped success card so the user gets
      // the same green confirmation flow as OS uploads.
      setResult({
        run_id: runId,
        computer_name: "Azure tenant",
        collected_at: collectedAt,
        links_created: data.findings_count ?? 0,
        linked_controls: data.findings_count ?? 0,
        skipped_controls: 0,
        collection_errors: data.failed_count ?? 0,
        collection_error_files: [],
        validator_findings: data.findings_count ?? 0,
        freshness: "current",
        age_days: 0,
        expires_at: new Date(Date.now() + 365 * 86400_000).toISOString(),
      });
      setCloudReport(null);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Network error");
    } finally {
      setCloudSubmitting(false);
    }
  };

  const reset = () => {
    setPreview(null);
    setValidationReport(null);
    setCloudReport(null);
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

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Links created", value: result.links_created },
            { label: "Controls linked", value: result.linked_controls },
            { label: "Controls skipped", value: result.skipped_controls },
            { label: "Collection errors", value: result.collection_errors },
            {
              label: "Validator findings",
              value: result.validator_findings ?? 0,
            },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border bg-white p-3 text-center">
              <p className="text-2xl font-bold tabular-nums">{value}</p>
              <p className="mt-0.5 text-xs text-gray-500">{label}</p>
            </div>
          ))}
        </div>

        <div className="rounded-lg border bg-white p-4 text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-gray-500">Collected</span>
            <span className="font-medium">{parseFreshnessDate(result.collected_at)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Evidence age</span>
            <span className="font-medium">{result.age_days} days</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Expires</span>
            <span className="font-medium">{parseFreshnessDate(result.expires_at)}</span>
          </div>
          {result.bundle_validation && (
            <div className="flex justify-between">
              <span className="text-gray-500">Bundle validation</span>
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
            className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Upload another manifest
          </button>
          <a
            href="/dashboard/boundary"
            className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
          >
            View System Boundary
          </a>
        </div>

        <IngestHistory history={history} loading={historyLoading} onRefresh={loadHistory} />
      </div>
    );
  }

  // ── Upload / Preview view ────────────────────────────────────────────────────
  return (
    <div className="space-y-6 py-4">
      <div>
        <h1 className="text-xl font-semibold">Upload Evidence</h1>
        <p className="mt-1 text-sm text-gray-500">
          Drop any of the three files below. Each one auto-detects and routes
          to the right ingest path. Evidence files stay where they were
          collected -- only the manifest (file paths + SHA-256 hashes) and
          validator findings are transmitted.
        </p>
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          <div className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2">
            <div className="font-semibold text-indigo-900">OS evidence (drop BOTH together)</div>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-slate-700">
              <li><span className="font-mono text-[11px]">manifest.json</span> -- from <code className="font-mono text-[10px]">Collect-Cui-Evidence-v2.ps1</code></li>
              <li><span className="font-mono text-[11px]">validation-report.json</span> -- from <code className="font-mono text-[10px]">Test-CuiHardening.ps1</code></li>
            </ul>
            <div className="mt-1 text-slate-500">Together: 76 files linked to controls + 53 per-check findings. Upload requires both.</div>
          </div>
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
            <div className="font-semibold text-blue-900">Cloud evidence (drop alone)</div>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-slate-700">
              <li><span className="font-mono text-[11px]">validation-report-azure-entra.json</span> -- from <code className="font-mono text-[10px]">validate_azure_entra v1.5+</code></li>
            </ul>
            <div className="mt-1 text-slate-500">Adjudicates 15 Azure controls in one shot. Re-uploads of the same run overwrite (idempotent).</div>
          </div>
        </div>
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
            className="w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
          <a href="/dashboard/boundary" className="underline underline-offset-2">
            Visit System Boundary first
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
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors " +
            (dragging
              ? "border-indigo-500 bg-indigo-50"
              : "border-gray-300 hover:border-indigo-400 hover:bg-gray-50")
          }
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
            <svg className="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <div>
            <p className="font-medium text-gray-900">
              Drop a JSON file here -- any of the three above
            </p>
            <p className="mt-0.5 text-sm text-gray-500">
              Auto-detects manifest, OS validator, or cloud validator. Drop in any order. JSON only, max 5 MB.
            </p>
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
          <p className="font-medium">Couldn&apos;t read that file</p>
          <p className="mt-1">{parseError}</p>
        </div>
      )}

      {/* OS validator report loaded but no manifest yet -- not an error,
          just a "you're partway done" status hint. */}
      {!preview && validationReport && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300">
          <p className="font-medium">
            ? Got the OS validator report ({validationReport.summary?.pass_count ?? 0} PASS / {validationReport.summary?.fail_count ?? 0} FAIL).
          </p>
          <p className="mt-1">
            Drop <code className="rounded bg-white/70 px-1 py-0.5 font-mono text-[11px]">manifest.json</code> from the same run next; we&apos;ll bundle them together at upload. Drop order doesn&apos;t matter.
          </p>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold">Manifest preview</p>
              <div className="flex items-center gap-2">
                {validationReport && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                    + validator report ({validationReport.summary?.pass_count ?? 0} PASS / {validationReport.summary?.fail_count ?? 0} FAIL)
                  </span>
                )}
                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  {preview.schema}
                </span>
              </div>
            </div>
            {!validationReport && (
              <p className="text-xs text-slate-500">
                Tip: drag <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[11px]">validation-report.json</code> from the same run to also record per-check PASS/FAIL findings (optional but recommended).
              </p>
            )}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <span className="text-gray-500">Computer</span>
                <p className="font-medium mt-0.5">{preview.computer_name}</p>
              </div>
              <div>
                <span className="text-gray-500">Run ID</span>
                <p className="font-medium font-mono text-xs mt-0.5 break-all">{preview.run_id}</p>
              </div>
              <div>
                <span className="text-gray-500">Collected at</span>
                <p className="font-medium mt-0.5">{parseFreshnessDate(preview.collected_at)}</p>
              </div>
              <div>
                <span className="text-gray-500">Files</span>
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
              className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={
                submitting ||
                !selectedBoundaryId ||
                boundaries.length === 0 ||
                !validationReport /* OS evidence is a 2-file PAIR — manifest + validator report. Don't let the user upload manifest alone; the codex needs both for full per-check adjudication. */
              }
              title={!validationReport ? "Drop validation-report.json from the same run before uploading -- the codex needs both files to record per-check PASS/FAIL findings." : ""}
              className="flex-1 inline-flex items-center justify-center rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Ingesting&hellip;
                </span>
              ) : !validationReport ? (
                "Drop validation-report.json to enable upload"
              ) : (
                "Ingest OS evidence (manifest + validator report)"
              )}
            </button>
          </div>
          {!validationReport && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
              <strong>OS evidence is a pair.</strong> Drop{" "}
              <code className="rounded bg-white/70 px-1 py-0.5 font-mono text-[11px]">validation-report.json</code>{" "}
              from the same run to enable upload. The manifest gives the codex
              file-level evidence; the validator report gives the codex
              per-check PASS/FAIL findings. We need both to adjudicate properly.
            </div>
          )}
        </div>
      )}

      {/* Cloud validator-report preview + submit (separate ingest path from
          the OS bundle -- routes through /api/os-baselines/.../import-report). */}
      {cloudReport && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold">Cloud validator report</p>
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                {cloudReport.validator?.name ?? "validate_azure_entra"} v{cloudReport.validator?.version ?? "?"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <span className="text-gray-500">Run ID</span>
                <p className="font-medium font-mono text-xs mt-0.5 break-all">{cloudReport.run_id ?? "(none)"}</p>
              </div>
              <div>
                <span className="text-gray-500">Generated</span>
                <p className="font-medium mt-0.5">
                  {cloudReport.generated_utc
                    ? parseFreshnessDate(cloudReport.generated_utc)
                    : "(unknown)"}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Verdict</span>
                <p className="font-medium mt-0.5">
                  {cloudReport.summary?.pass_count ?? 0} PASS &middot;{" "}
                  {cloudReport.summary?.partial_count ?? 0} PARTIAL &middot;{" "}
                  {cloudReport.summary?.fail_count ?? 0} FAIL
                </p>
              </div>
              <div>
                <span className="text-gray-500">Checks</span>
                <p className="font-medium mt-0.5">{Array.isArray(cloudReport.checks) ? cloudReport.checks.length : 0}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              onClick={() => setCloudReport(null)}
              disabled={cloudSubmitting}
              className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCloudSubmit}
              disabled={cloudSubmitting || !selectedBoundaryId || boundaries.length === 0}
              className="flex-1 inline-flex items-center justify-center rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cloudSubmitting ? "Ingesting cloud report…" : "Ingest cloud report"}
            </button>
          </div>
        </div>
      )}

      {/* Instructions */}
      {!preview && !cloudReport && (
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer text-sm font-medium">How to get manifest.json from your CUI Vault VM</summary>
          <ol className="mt-3 space-y-2 text-sm text-gray-500 list-decimal list-inside">
            <li>
              RDP or SSH into your Windows Server VM as a local administrator.
            </li>
            <li>
              Open PowerShell 5.1 as administrator and run:{" "}
              <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs">
                .\Collect-Cui-Evidence-v2.ps1
              </code>
            </li>
            <li>
              When complete, the script prints the bundle path (e.g.{" "}
              <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs">
                C:\CUI-Evidence\&lt;run-id&gt;\
              </code>
              ).
            </li>
            <li>
              Navigate to the bundle folder, open the{" "}
              <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs">meta\</code> subfolder, and copy{" "}
              <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs">manifest.json</code> to your workstation.
            </li>
            <li>Drop the file here to ingest it.</li>
          </ol>
          <p className="mt-3 text-xs text-gray-500">
            The manifest contains only file paths and SHA-256 hashes — no CUI content leaves the VM.
          </p>
        </details>
      )}

      <IngestHistory history={history} loading={historyLoading} onRefresh={loadHistory} />
    </div>
  );
}
