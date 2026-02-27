"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

export default function TechnicalUploadPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [systemId, setSystemId] = useState("");
  const [runId, setRunId] = useState("");
  const [collectedAt, setCollectedAt] = useState("");
  const [manifestFile, setManifestFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/os-baselines/assets")
      .then((r) => (r.ok ? r.json() : []))
      .then(setAssets)
      .finally(() => setLoadingAssets(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!systemId.trim() || !runId.trim() || !collectedAt.trim()) {
      setError("Asset, Run ID, and Collected at are required.");
      return;
    }
    if (!manifestFile) {
      setError("Please select a manifest JSON file.");
      return;
    }

    let body: {
      system_id: string;
      run_id: string;
      collected_at: string;
      files: Array<{ path: string; sha256: string; size_bytes: number }>;
      collector_name?: string;
      collector_version?: string;
      bundle_root?: string;
      manifest?: unknown;
    };

    try {
      const text = await manifestFile.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const files = Array.isArray(parsed.files)
        ? (parsed.files as Array<{ path: string; sha256: string; size_bytes: number }>)
        : [];
      if (files.length === 0) {
        setError("Manifest JSON must contain a 'files' array with objects { path, sha256, size_bytes }.");
        return;
      }
      body = {
        system_id: systemId.trim(),
        run_id: runId.trim(),
        collected_at: collectedAt.trim(),
        files,
        collector_name: (parsed.collector_name as string) ?? "upload",
        collector_version: (parsed.collector_version as string) ?? "1",
        bundle_root: (parsed.bundle_root as string) ?? undefined,
        manifest: parsed.manifest ?? {},
      };
    } catch {
      setError("Invalid JSON in manifest file. Expected { files: [{ path, sha256, size_bytes }, ...] }.");
      return;
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
      router.push("/dashboard/technical");
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
            Provide manifest metadata and a JSON manifest file listing files in the bundle (path, sha256, size_bytes). Use the manifest from your evidence run—e.g. inside the run folder, <code className="rounded bg-[var(--color-gray-100)] px-1">meta/manifest.json</code>. Do not upload the zip; upload that .json file. The system will create a run and adjudicate controls for the selected asset.
          </p>
        </div>

        <section className={cardClass}>
          {loadingAssets ? (
            <p className="text-sm text-[var(--color-gray-500)]">Loading assets…</p>
          ) : assets.length === 0 ? (
            <div className="rounded-lg border border-[var(--color-status-amber)] bg-[var(--color-status-amber)]/10 p-4">
              <p className="text-sm font-medium text-[var(--color-gray-800)]">
                No OS assets found
              </p>
              <p className="mt-1 text-sm text-[var(--color-gray-600)]">
                Add an endpoint in System Boundary and assign a baseline so evidence runs can be evaluated.
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
                <label htmlFor="asset" className="block text-sm font-medium text-[var(--color-gray-700)]">
                  Asset (system)
                </label>
                <select
                  id="asset"
                  value={systemId}
                  onChange={(e) => setSystemId(e.target.value)}
                  className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
                  required
                >
                  <option value="">Select an asset</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.hostname} {a.baselineProfileId ? "" : "(no baseline)"}
                    </option>
                  ))}
                </select>
              </div>
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
                  Manifest JSON file
                </label>
                <p className="mt-0.5 text-xs text-[var(--color-gray-500)]">
                  Choose the <strong>manifest.json</strong> from your evidence run (e.g. <code className="rounded bg-[var(--color-gray-100)] px-1">meta/manifest.json</code>). JSON must have a <code className="rounded bg-[var(--color-gray-100)] px-1">files</code> array: {"[{ path, sha256, size_bytes }, ...]"}
                </p>
                <input
                  id="manifest"
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => setManifestFile(e.target.files?.[0] ?? null)}
                  className="mt-1 w-full text-sm"
                />
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
      </div>
    </div>
  );
}
