"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Upload, CheckCircle2, AlertCircle, FileJson } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type DetectedType =
  | { kind: "os-v2"; runId: string; computerName: string; collectedAt: string; fileCount: number; raw: unknown }
  | { kind: "governance"; schema: string; docCount: number; runId: string | null; raw: unknown }
  | { kind: "azure"; runId?: string; checkCount: number; raw: unknown }
  | { kind: "unknown"; schema?: string };

type IngestResult =
  | { kind: "os-v2"; linked_controls: number; skipped_controls: number; collection_errors: number }
  | { kind: "governance"; doc_count: number; policy_satisfied_count: number; implemented_promoted: number; run_id: string }
  | { kind: "azure"; run_id: string };

const GOV_SCHEMAS = ["mactech-governance-manifest.v1", "mactech.codex.manual.governance_manifest"];

// ── File detection ────────────────────────────────────────────────────────────

function detectFile(json: unknown): DetectedType {
  if (!json || typeof json !== "object") return { kind: "unknown" };
  const m = json as Record<string, unknown>;
  const schema = typeof m.schema === "string" ? m.schema : undefined;

  if (schema === "cui-evidence.manifest.v2") {
    return {
      kind: "os-v2",
      runId: typeof m.run_id === "string" ? m.run_id : "unknown",
      computerName: typeof m.computer_name === "string" ? m.computer_name : "unknown",
      collectedAt: typeof m.collected_at === "string" ? m.collected_at : "",
      fileCount: Array.isArray(m.files) ? m.files.length : 0,
      raw: json,
    };
  }

  if (schema && GOV_SCHEMAS.includes(schema)) {
    const docs = Array.isArray(m.documents) ? m.documents : Array.isArray(m.docs) ? m.docs : [];
    return {
      kind: "governance",
      schema,
      docCount: docs.length,
      runId: typeof m.run_id === "string" ? m.run_id : null,
      raw: json,
    };
  }

  // Azure/Entra validation report: has validator object + checks array
  if (m.validator && typeof m.validator === "object" && Array.isArray(m.checks)) {
    return {
      kind: "azure",
      runId: typeof m.run_id === "string" ? m.run_id : undefined,
      checkCount: m.checks.length,
      raw: json,
    };
  }

  return { kind: "unknown", schema };
}

// ── Labels ────────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, { title: string; desc: string; color: string; border: string; bg: string }> = {
  "os-v2": {
    title: "OS Evidence Bundle (v2)",
    desc: "Collect-Cui-Evidence-v2.ps1 manifest — links OS evidence to technical controls",
    color: "text-blue-700 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-700/40",
    bg: "bg-blue-50 dark:bg-blue-950/20",
  },
  governance: {
    title: "Governance Doc Bundle",
    desc: "QMS CLI governance manifest — registers policies/SOPs and satisfies governance lanes",
    color: "text-amber-700 dark:text-amber-400",
    border: "border-amber-200 dark:border-amber-700/40",
    bg: "bg-amber-50 dark:bg-amber-950/20",
  },
  azure: {
    title: "Azure / Entra Evidence Report",
    desc: "Cloud hosting validation report — satisfies cloud technical controls",
    color: "text-violet-700 dark:text-violet-400",
    border: "border-violet-200 dark:border-violet-700/40",
    bg: "bg-violet-50 dark:bg-violet-950/20",
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function UnifiedUploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragOver, setDragOver] = useState(false);
  const [detected, setDetected] = useState<DetectedType | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResult | null>(null);

  // Optional fields for Azure upload
  const [azureRunId, setAzureRunId] = useState("");
  const [azureCollectedAt, setAzureCollectedAt] = useState("");
  const [azureBoundaryId, setAzureBoundaryId] = useState("");

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
        // Strip UTF-8 BOM (PowerShell writes this)
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
        const json = JSON.parse(text);
        const d = detectFile(json);
        if (d.kind === "unknown") {
          setParseError(
            `Unrecognized file format${d.schema ? ` (schema: "${d.schema}")` : ""}.\n\nAccepted files:\n• cui-evidence.manifest.v2 (OS evidence)\n• mactech-governance-manifest.v1 (governance docs)\n• Azure/Entra validation report (validator + checks)`
          );
          return;
        }
        setDetected(d);
        // Pre-fill Azure fields from manifest if present
        if (d.kind === "azure" && d.runId) setAzureRunId(d.runId);
      } catch {
        setParseError("Could not parse JSON — make sure you selected the correct manifest file.");
      }
    };
    reader.readAsText(file);
  }, [reset]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const generateRunId = () => {
    const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    return `GOV-${ts}-${Math.random().toString(36).slice(2, 8)}`;
  };

  const handleSubmit = async () => {
    if (!detected || detected.kind === "unknown") return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      if (detected.kind === "os-v2") {
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
        setResult({ kind: "os-v2", linked_controls: data.linked_controls ?? 0, skipped_controls: data.skipped_controls ?? 0, collection_errors: data.collection_errors ?? 0 });
        router.refresh();
        return;
      }

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
        setResult({ kind: "governance", doc_count: data.doc_count ?? 0, policy_satisfied_count: data.policy_satisfied_count ?? 0, implemented_promoted: data.implemented_promoted ?? 0, run_id: data.run_id ?? runId });
        router.refresh();
        return;
      }

      if (detected.kind === "azure") {
        if (!azureRunId.trim() || !azureCollectedAt.trim() || !azureBoundaryId.trim()) {
          setSubmitError("Run ID, Collected at, and Boundary ID are required for Azure reports.");
          return;
        }
        const raw = detected.raw as Record<string, unknown>;
        const res = await fetch(
          `/api/os-baselines/boundaries/${azureBoundaryId.trim()}/evidence-runs/import-report`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              run_id: azureRunId.trim(),
              collected_at: azureCollectedAt.trim(),
              report: { validator: raw.validator, inputs: raw.inputs ?? [], checks: raw.checks, ...(raw.manifest_metadata != null && { manifest_metadata: raw.manifest_metadata }), ...(raw.summary != null && { summary: raw.summary }) },
            }),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setSubmitError(data.error ?? `Upload failed (${res.status})`); return; }
        setResult({ kind: "azure", run_id: azureRunId.trim() });
        router.refresh();
        return;
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const card = "rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm";
  const detectedMeta = detected && detected.kind !== "unknown" ? TYPE_LABELS[detected.kind] : null;

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-2xl space-y-6">

        {/* Back */}
        <Link
          href="/dashboard/technical"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-gray-500)] hover:underline"
        >
          <ChevronLeft className="h-4 w-4" />
          Infrastructure Compliance
        </Link>

        <div>
          <h1 className="text-2xl font-bold text-[var(--color-gray-900)]">Upload evidence</h1>
          <p className="mt-1 text-sm text-[var(--color-gray-500)]">
            Drop any evidence file — OS scan manifest, governance bundle, or Azure report. The system auto-detects the type and routes it to the right pipeline.
          </p>
        </div>

        {/* ── Drop zone ──────────────────────────────────────────────────────── */}
        {!detected && !result && (
          <section className={card}>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-4 rounded-[var(--radius-lg)] border-2 border-dashed p-12 text-center transition-colors ${
                dragOver
                  ? "border-[var(--color-blue-accent)] bg-blue-50 dark:bg-blue-950/20"
                  : "border-[var(--color-border)] hover:border-[var(--color-gray-400)]"
              }`}
            >
              <div className="rounded-full bg-[var(--color-gray-100)] p-4 dark:bg-gray-800">
                <FileJson className="h-8 w-8 text-[var(--color-gray-400)]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--color-gray-800)]">
                  Drop any evidence manifest here
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

            {/* What's accepted */}
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {[
                { label: "OS Evidence (v2)", file: "manifest-*.json", hint: "from Collect-Cui-Evidence-v2.ps1", color: "text-blue-600" },
                { label: "Governance Bundle", file: "governance-manifest-*.json", hint: "from MacTech QMS CLI", color: "text-amber-600" },
                { label: "Azure/Entra Report", file: "validation-report-*.json", hint: "from cloud evidence script", color: "text-violet-600" },
              ].map(({ label, file, hint, color }) => (
                <div key={label} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
                  <p className={`text-xs font-semibold ${color}`}>{label}</p>
                  <p className="mt-0.5 font-mono text-xs text-[var(--color-gray-500)]">{file}</p>
                  <p className="mt-0.5 text-xs text-[var(--color-gray-400)]">{hint}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Parse error ────────────────────────────────────────────────────── */}
        {parseError && (
          <section className={card}>
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-500 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">Unrecognized file</p>
                <p className="mt-1 whitespace-pre-line text-xs text-[var(--color-gray-600)]">{parseError}</p>
                <button onClick={reset} className="mt-3 text-xs font-medium text-[var(--color-blue-accent)] hover:underline">
                  Try a different file
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ── Detected file preview ──────────────────────────────────────────── */}
        {detected && detected.kind !== "unknown" && !result && detectedMeta && (
          <section className={card}>
            <div className={`-mx-6 -mt-6 mb-5 rounded-t-[var(--radius-xl)] border-b px-6 py-4 ${detectedMeta.border} ${detectedMeta.bg}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm font-semibold ${detectedMeta.color}`}>{detectedMeta.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--color-gray-500)]">{detectedMeta.desc}</p>
                </div>
                <button onClick={reset} className="text-xs text-[var(--color-gray-400)] hover:text-[var(--color-gray-600)]">
                  Clear
                </button>
              </div>
            </div>

            {/* OS v2 summary */}
            {detected.kind === "os-v2" && (
              <dl className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-[var(--color-gray-500)]">Computer</dt>
                  <dd className="mt-0.5 font-mono text-xs font-semibold text-[var(--color-gray-800)]">{detected.computerName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--color-gray-500)]">Files collected</dt>
                  <dd className="mt-0.5 text-xl font-bold text-[var(--color-navy-primary)]">{detected.fileCount}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--color-gray-500)]">Run ID</dt>
                  <dd className="mt-0.5 font-mono text-xs text-[var(--color-gray-600)] break-all">{detected.runId}</dd>
                </div>
                {detected.collectedAt && (
                  <div className="col-span-3">
                    <dt className="text-xs text-[var(--color-gray-500)]">Collected at</dt>
                    <dd className="mt-0.5 text-xs text-[var(--color-gray-600)]">{new Date(detected.collectedAt).toLocaleString()}</dd>
                  </div>
                )}
              </dl>
            )}

            {/* Governance summary */}
            {detected.kind === "governance" && (
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-[var(--color-gray-500)]">Documents</dt>
                  <dd className="mt-0.5 text-xl font-bold text-[var(--color-navy-primary)]">{detected.docCount}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--color-gray-500)]">Schema</dt>
                  <dd className="mt-0.5 font-mono text-xs text-[var(--color-gray-600)]">{detected.schema}</dd>
                </div>
                {detected.runId && (
                  <div className="col-span-2">
                    <dt className="text-xs text-[var(--color-gray-500)]">Run ID</dt>
                    <dd className="mt-0.5 font-mono text-xs text-[var(--color-gray-600)]">{detected.runId}</dd>
                  </div>
                )}
              </dl>
            )}

            {/* Azure summary + required fields */}
            {detected.kind === "azure" && (
              <div className="space-y-4">
                <dl className="grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-xs text-[var(--color-gray-500)]">Checks</dt>
                    <dd className="mt-0.5 text-xl font-bold text-[var(--color-navy-primary)]">{detected.checkCount}</dd>
                  </div>
                </dl>
                <div className="grid gap-3">
                  {[
                    { label: "Run ID", value: azureRunId, set: setAzureRunId, placeholder: "azure-run-20260411" },
                    { label: "Collected at (ISO)", value: azureCollectedAt, set: setAzureCollectedAt, placeholder: "2026-04-11T18:00:00Z" },
                    { label: "Boundary ID", value: azureBoundaryId, set: setAzureBoundaryId, placeholder: "UUID of your Azure boundary" },
                  ].map(({ label, value, set, placeholder }) => (
                    <div key={label}>
                      <label className="block text-xs font-medium text-[var(--color-gray-700)]">{label}</label>
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => set(e.target.value)}
                        placeholder={placeholder}
                        className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Submit error */}
            {submitError && (
              <div className="mt-4 rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800/40 dark:bg-red-950/20 dark:text-red-300">
                {submitError}
              </div>
            )}

            {(
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => handleSubmit()}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  {submitting ? "Ingesting…" : "Ingest"}
                </button>
                <button
                  onClick={reset}
                  className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
                >
                  Cancel
                </button>
              </div>
            )}
          </section>
        )}

        {/* ── Success ────────────────────────────────────────────────────────── */}
        {result && (
          <section className={card}>
            <div className="flex items-center gap-3 mb-5">
              <div className="rounded-full bg-emerald-100 p-2 dark:bg-emerald-900/30">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--color-gray-900)]">Evidence ingested successfully</p>
                <p className="text-xs text-[var(--color-gray-500)]">
                  {result.kind === "os-v2" && "OS evidence linked to technical controls"}
                  {result.kind === "governance" && `Governance run ${result.run_id}`}
                  {result.kind === "azure" && `Azure run ${result.run_id}`}
                </p>
              </div>
            </div>

            {result.kind === "os-v2" && (
              <dl className="grid grid-cols-3 gap-4">
                <div>
                  <dt className="text-xs text-[var(--color-gray-500)]">Controls linked</dt>
                  <dd className="mt-0.5 text-2xl font-bold text-[var(--color-navy-primary)]">{result.linked_controls}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--color-gray-500)]">Skipped</dt>
                  <dd className="mt-0.5 text-2xl font-bold text-[var(--color-gray-400)]">{result.skipped_controls}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--color-gray-500)]">Collection errors</dt>
                  <dd className={`mt-0.5 text-2xl font-bold ${result.collection_errors > 0 ? "text-amber-500" : "text-[var(--color-gray-400)]"}`}>
                    {result.collection_errors}
                  </dd>
                </div>
              </dl>
            )}

            {result.kind === "governance" && (
              <dl className="grid grid-cols-3 gap-4">
                <div>
                  <dt className="text-xs text-[var(--color-gray-500)]">Documents registered</dt>
                  <dd className="mt-0.5 text-2xl font-bold text-[var(--color-navy-primary)]">{result.doc_count}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--color-gray-500)]">Lanes satisfied</dt>
                  <dd className="mt-0.5 text-2xl font-bold text-[var(--color-navy-primary)]">{result.policy_satisfied_count}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--color-gray-500)]">Promoted → Implemented</dt>
                  <dd className={`mt-0.5 text-2xl font-bold ${result.implemented_promoted > 0 ? "text-emerald-600" : "text-[var(--color-gray-400)]"}`}>
                    {result.implemented_promoted}
                  </dd>
                </div>
              </dl>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/dashboard/technical"
                className="inline-flex items-center rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
              >
                View compliance status →
              </Link>
              <button
                onClick={reset}
                className="inline-flex items-center rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
              >
                Upload another file
              </button>
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
