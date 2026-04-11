"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Upload } from "lucide-react";

type Asset = {
  id: string;
  hostname: string;
  osFamily: string;
  osVersion: string;
  role: string;
  baselineProfileId: string | null;
  boundaryName: string | null;
};

type Boundary = {
  id: string;
  name: string;
  cloudProvider: string | null;
};

type UploadTarget = "os" | "cloud";

export default function TechnicalUploadPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const assetIdFromUrl = searchParams.get("assetId") ?? "";
  const [uploadTarget, setUploadTarget] = useState<UploadTarget>("os");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [boundaries, setBoundaries] = useState<Boundary[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [loadingBoundaries, setLoadingBoundaries] = useState(true);
  const [systemId, setSystemId] = useState("");
  const [cloudBoundaryId, setCloudBoundaryId] = useState("");
  const [runId, setRunId] = useState("");
  const [collectedAt, setCollectedAt] = useState("");
  const [manifestFile, setManifestFile] = useState<File | null>(null);
  const [isV2Manifest, setIsV2Manifest] = useState(false);
  const [v2Result, setV2Result] = useState<{ linked_controls: number; skipped_controls: number; collection_errors: number; promoted?: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasPreselected = useRef(false);

  const cloudBoundaries = boundaries.filter(
    (b) => b.cloudProvider === "microsoft" || b.cloudProvider === "azure"
  );

  useEffect(() => {
    fetch("/api/os-baselines/assets")
      .then((r) => (r.ok ? r.json() : []))
      .then(setAssets)
      .finally(() => setLoadingAssets(false));
    fetch("/api/os-baselines/boundaries")
      .then((r) => (r.ok ? r.json() : []))
      .then(setBoundaries)
      .finally(() => setLoadingBoundaries(false));
  }, []);

  useEffect(() => {
    if (loadingAssets || !assetIdFromUrl || hasPreselected.current || assets.length === 0) return;
    const match = assets.find((a) => a.id === assetIdFromUrl);
    if (match) {
      setSystemId(match.id);
      setUploadTarget("os");
      hasPreselected.current = true;
    }
  }, [assets, assetIdFromUrl, loadingAssets]);

  useEffect(() => {
    if (loadingAssets || loadingBoundaries) return;
    if (assets.length === 0 && cloudBoundaries.length > 0) setUploadTarget("cloud");
  }, [loadingAssets, loadingBoundaries, assets.length, cloudBoundaries.length]);

  /** Detect 73-check validation report (validator + checks array). */
  function isValidationReport(parsed: Record<string, unknown>): boolean {
    if (!parsed?.validator || typeof parsed.validator !== "object") return false;
    if (!Array.isArray(parsed.checks)) return false;
    const first = parsed.checks[0];
    return first != null && typeof first === "object" && "control" in first && "pass" in (first as Record<string, unknown>);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (uploadTarget === "cloud") {
      if (!cloudBoundaryId.trim() || !runId.trim() || !collectedAt.trim()) {
        setError("Boundary, Run ID, and Collected at are required.");
        return;
      }
      if (!manifestFile) {
        setError("Please select an Azure/Entra validation report (JSON with validator and checks).");
        return;
      }
      setSubmitting(true);
      try {
        const text = await manifestFile.text();
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (!isValidationReport(parsed)) {
          setError("Cloud evidence requires a validator report (validator + checks array). Use the Azure/Entra validation report JSON.");
          setSubmitting(false);
          return;
        }
        const report = {
          validator: parsed.validator,
          inputs: parsed.inputs ?? [],
          checks: parsed.checks,
          ...(parsed.manifest_metadata != null && { manifest_metadata: parsed.manifest_metadata }),
          ...(parsed.summary != null && { summary: parsed.summary }),
        };
        const res = await fetch(
          `/api/os-baselines/boundaries/${cloudBoundaryId.trim()}/evidence-runs/import-report`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ run_id: runId.trim(), collected_at: collectedAt.trim(), report }),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? `Upload failed (${res.status})`);
          setSubmitting(false);
          return;
        }
        router.push("/dashboard/technical");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!manifestFile) {
      setError("Please select a manifest JSON file or 73-check validation report.");
      return;
    }

    let parsedFile: Record<string, unknown>;
    try {
      const text = await manifestFile.text();
      parsedFile = JSON.parse(text.replace(/^\uFEFF/, "")) as Record<string, unknown>;
    } catch {
      setError("Invalid JSON — could not parse the selected file.");
      return;
    }

    // ── v2 manifest: route to /api/evidence/v2/ingest ──────────────────────
    if (parsedFile.schema === "cui-evidence.manifest.v2") {
      // boundary_id is optional for v2; asset id used for display only
      setSubmitting(true);
      try {
        // boundary_id must be a boundaries.id — systemId is an asset UUID, not a boundary UUID.
        // For v2 ingests the computer_name is used to auto-discover/stub the asset.
        const res = await fetch("/api/evidence/v2/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ manifest: parsedFile }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? `Upload failed (${res.status})`);
          return;
        }
        setV2Result({
          linked_controls: data.linked_controls ?? 0,
          skipped_controls: data.skipped_controls ?? 0,
          collection_errors: data.collection_errors ?? 0,
          promoted: data.promoted,
        });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // ── Legacy / validation report: original flow ───────────────────────────
    if (!systemId.trim() || !runId.trim() || !collectedAt.trim()) {
      setError("Asset, Run ID, and Collected at are required.");
      return;
    }

    let body: Record<string, unknown>;
    if (isValidationReport(parsedFile)) {
      const report: Record<string, unknown> = {
        validator: parsedFile.validator,
        inputs: parsedFile.inputs ?? [],
        checks: parsedFile.checks,
      };
      if (parsedFile.manifest_metadata != null) report.manifest_metadata = parsedFile.manifest_metadata;
      if (parsedFile.summary != null) report.summary = parsedFile.summary;
      body = {
        system_id: systemId.trim(),
        run_id: runId.trim(),
        collected_at: collectedAt.trim(),
        source: "windows_server_hardening",
        report,
      };
    } else {
      const files = Array.isArray(parsedFile.files)
        ? (parsedFile.files as Array<{ path: string; sha256: string; size_bytes: number }>)
        : [];
      if (files.length === 0) {
        setError(
          "Manifest JSON must contain a 'files' array, or upload a 73-check validation report (validation-report-windows-hardening.json)."
        );
        return;
      }
      body = {
        system_id: systemId.trim(),
        run_id: runId.trim(),
        collected_at: collectedAt.trim(),
        files,
        collector_name: (parsedFile.collector_name as string) ?? "upload",
        collector_version: (parsedFile.collector_version as string) ?? "1",
        bundle_root: (parsedFile.bundle_root as string) ?? undefined,
        manifest: parsedFile.manifest ?? {},
      };
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/evidence-runs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Upload failed (${res.status})`);
        return;
      }
      if (systemId.trim()) {
        router.push(`/dashboard/os-baselines/assets/${systemId.trim()}`);
      } else {
        router.push("/dashboard/technical");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  const cardClass =
    "rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm";

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-2 text-sm text-[var(--color-gray-500)]">
          <Link
            href="/dashboard/technical"
            className="inline-flex items-center gap-1 hover:underline"
          >
            <ChevronLeft className="h-4 w-4" />
            Technical onboarding
          </Link>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-[var(--color-gray-900)]">
            Upload evidence bundle
          </h1>
          <p className="mt-1 text-sm text-[var(--color-gray-600)]">
            Upload <strong>OS asset</strong> evidence (manifest or 73-check report) or <strong>Cloud Hosting</strong> evidence (Azure/Entra validation report). OS runs attach to an endpoint; cloud runs attach to a boundary with Microsoft or Azure cloud provider.
          </p>
        </div>

        <section className={cardClass}>
          {loadingAssets || loadingBoundaries ? (
            <p className="text-sm text-[var(--color-gray-500)]">Loading…</p>
          ) : assets.length === 0 && cloudBoundaries.length === 0 ? (
            <div className="rounded-lg border border-[var(--color-status-amber)] bg-[var(--color-status-amber)]/10 p-4">
              <p className="text-sm font-medium text-[var(--color-gray-800)]">
                No OS assets or cloud boundaries
              </p>
              <p className="mt-1 text-sm text-[var(--color-gray-600)]">
                Add an endpoint in System Boundary (and assign a baseline) for OS evidence, or add a boundary with Microsoft or Azure cloud provider for Cloud Hosting evidence.
              </p>
              <Link
                href="/dashboard/os-baselines"
                className="mt-2 inline-block text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
              >
                Go to System Boundary →
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg border border-[var(--color-status-red)] bg-[var(--color-status-red)]/10 p-3 text-sm text-[var(--color-status-red)]">
                  {error}
                </div>
              )}
              <div>
                <span className="block text-sm font-medium text-[var(--color-gray-700)]">Evidence target</span>
                <div className="mt-2 flex flex-wrap gap-4">
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="target"
                      checked={uploadTarget === "os"}
                      onChange={() => setUploadTarget("os")}
                      className="rounded border-[var(--color-border)]"
                    />
                    <span>OS Asset</span>
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="target"
                      checked={uploadTarget === "cloud"}
                      onChange={() => {
                        setUploadTarget("cloud");
                        if (cloudBoundaries.length === 1) setCloudBoundaryId(cloudBoundaries[0]!.id);
                      }}
                      className="rounded border-[var(--color-border)]"
                      disabled={cloudBoundaries.length === 0}
                    />
                    <span>Cloud Hosting (Azure/Entra)</span>
                    {cloudBoundaries.length === 0 && (
                      <span className="text-xs text-[var(--color-gray-500)]">— add a boundary with Microsoft/Azure</span>
                    )}
                  </label>
                </div>
              </div>
              {uploadTarget === "os" && (
              <div>
                <label htmlFor="asset" className="block text-sm font-medium text-[var(--color-gray-700)]">
                  Asset (system){isV2Manifest && <span className="ml-1 text-xs font-normal text-[var(--color-gray-500)]">(optional for v2 — auto-discovered)</span>}
                </label>
                <select
                  id="asset"
                  value={systemId}
                  onChange={(e) => setSystemId(e.target.value)}
                  className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                  required={uploadTarget === "os" && !isV2Manifest}
                >
                  <option value="">Select an asset</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.hostname} {a.baselineProfileId ? "" : "(no baseline)"}
                    </option>
                  ))}
                </select>
              </div>
              )}
              {uploadTarget === "cloud" && (
              <div>
                <label htmlFor="cloud-boundary" className="block text-sm font-medium text-[var(--color-gray-700)]">
                  Boundary (cloud hosting)
                </label>
                <select
                  id="cloud-boundary"
                  value={cloudBoundaryId}
                  onChange={(e) => setCloudBoundaryId(e.target.value)}
                  className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                  required={uploadTarget === "cloud"}
                >
                  <option value="">Select a boundary</option>
                  {cloudBoundaries.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              )}
              <div>
                <label htmlFor="run_id" className="block text-sm font-medium text-[var(--color-gray-700)]">
                  Run ID
                </label>
                <input
                  id="run_id"
                  type="text"
                  value={runId}
                  onChange={(e) => setRunId(e.target.value)}
                  placeholder="e.g. CUI-Evidence-20260225-120000"
                  className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label htmlFor="collected_at" className="block text-sm font-medium text-[var(--color-gray-700)]">
                  Collected at (ISO)
                </label>
                <input
                  id="collected_at"
                  type="datetime-local"
                  value={collectedAt}
                  onChange={(e) => setCollectedAt(e.target.value)}
                  className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label htmlFor="manifest" className="block text-sm font-medium text-[var(--color-gray-700)]">
                  {uploadTarget === "cloud" ? "Azure/Entra validation report" : "Manifest or validation report"}
                </label>
                <p className="mt-0.5 text-xs text-[var(--color-gray-500)]">
                  {uploadTarget === "cloud"
                    ? "Choose the Azure/Entra validation report JSON (validator + checks array)."
                    : "Choose manifest.json (with a files array) or the 73-check report (validation-report-windows-hardening.json) from your evidence run."}
                </p>
                <input
                  id="manifest"
                  type="file"
                  accept=".json,application/json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0] ?? null;
                    setManifestFile(file);
                    setIsV2Manifest(false);
                    setV2Result(null);
                    setError(null);
                    if (!file) return;
                    try {
                      const text = await file.text();
                      const parsed = JSON.parse(text.replace(/^\uFEFF/, "")) as Record<string, unknown>;
                      if (parsed.schema === "cui-evidence.manifest.v2") {
                        setIsV2Manifest(true);
                        if (parsed.run_id && typeof parsed.run_id === "string") setRunId(parsed.run_id);
                        if (parsed.collected_at && typeof parsed.collected_at === "string") {
                          // Convert ISO to datetime-local format
                          setCollectedAt(parsed.collected_at.slice(0, 16));
                        }
                      }
                    } catch { /* non-JSON or not v2 — handled on submit */ }
                  }}
                  className="mt-1 w-full text-sm"
                />
                {isV2Manifest && (
                  <p className="mt-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    ✓ v2 manifest detected — Run ID and date auto-filled. Will ingest via fast OS evidence pipeline.
                  </p>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  {submitting ? "Importing…" : "Import run"}
                </button>
                <Link
                  href="/dashboard/technical"
                  className="inline-flex items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
                >
                  Cancel
                </Link>
              </div>
            </form>
          )}
        </section>

        {v2Result && (
          <section className={cardClass}>
            <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">
              v2 evidence ingested
            </h2>
            <dl className="mt-3 grid grid-cols-3 gap-4">
              <div>
                <dt className="text-xs text-[var(--color-gray-500)]">Controls linked</dt>
                <dd className="mt-0.5 text-2xl font-bold text-[var(--color-navy-primary)]">
                  {v2Result.linked_controls}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-gray-500)]">Skipped</dt>
                <dd className="mt-0.5 text-2xl font-bold text-[var(--color-gray-600)]">
                  {v2Result.skipped_controls}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-gray-500)]">Collection errors</dt>
                <dd className={`mt-0.5 text-2xl font-bold ${v2Result.collection_errors > 0 ? "text-amber-600" : "text-[var(--color-gray-600)]"}`}>
                  {v2Result.collection_errors}
                </dd>
              </div>
            </dl>
            {v2Result.promoted != null && v2Result.promoted > 0 && (
              <p className="mt-3 text-sm font-medium text-emerald-700">
                {v2Result.promoted} control{v2Result.promoted > 1 ? "s" : ""} promoted to Implemented
              </p>
            )}
            <div className="mt-4 flex gap-3">
              <Link
                href="/dashboard/technical"
                className="inline-flex items-center rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
              >
                View Technical dashboard →
              </Link>
              <Link
                href="/dashboard/evidence"
                className="inline-flex items-center rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
              >
                View evidence runs
              </Link>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
