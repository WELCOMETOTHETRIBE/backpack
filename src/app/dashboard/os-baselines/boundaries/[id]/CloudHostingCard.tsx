"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Cloud, Shield, PlusCircle, Building2, ChevronDown, ChevronRight, Upload } from "lucide-react";
import { AZURE_ENTRA_BASELINE } from "@/lib/compliance/azure-entra-controls";
import { AZURE_INHERITED_3_10_BASELINE } from "@/lib/compliance/azure-inherited-controls";

type ImportResult = {
  findings_count: number;
  passed_count: number;
  failed_count: number;
  poam_entries_created: number;
  controls_marked_partial: number;
} | null;

function AzureEntraBulkUpload({ boundaryId }: { boundaryId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [runId, setRunId] = useState("");
  const [collectedAt, setCollectedAt] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!file || !runId.trim() || !collectedAt.trim()) {
      setError("Run ID, collected date, and report file are required.");
      return;
    }
    setUploading(true);
    try {
      const text = await file.text();
      const report = JSON.parse(text) as unknown;
      if (!report || typeof report !== "object" || !(report as Record<string, unknown>).validator || !Array.isArray((report as Record<string, unknown>).checks)) {
        setError("File must be a validation report JSON (validator + checks).");
        return;
      }
      const res = await fetch(`/api/os-baselines/boundaries/${boundaryId}/evidence-runs/import-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_id: runId.trim(),
          collected_at: collectedAt.trim(),
          report,
          replace_existing: replaceExisting,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Upload failed");
        return;
      }
      setResult({
        findings_count: data.findings_count ?? 0,
        passed_count: data.passed_count ?? 0,
        failed_count: data.failed_count ?? 0,
        poam_entries_created: data.poam_entries_created ?? 0,
        controls_marked_partial: data.controls_marked_partial ?? 0,
      });
      setFile(null);
      setRunId("");
      setCollectedAt("");
      if (typeof document !== "undefined" && document.getElementById("azure-entra-report-file")) {
        (document.getElementById("azure-entra-report-file") as HTMLInputElement).value = "";
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/30 p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-[var(--color-gray-700)]">
        <Upload className="h-4 w-4" aria-hidden />
        Upload validation report
      </p>
      <p className="mt-0.5 text-xs text-[var(--color-gray-600)]">
        Upload <code className="rounded bg-[var(--color-gray-200)] px-1">validation-report-azure-entra.json</code> from the validator for bulk ingest.
      </p>
      <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-[180px]">
          <label className="block text-xs font-medium text-[var(--color-gray-600)]">Report file (JSON)</label>
          <input
            id="azure-entra-report-file"
            type="file"
            accept=".json,application/json"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm text-[var(--color-gray-600)] file:mr-2 file:rounded file:border-0 file:bg-[var(--color-gray-800)] file:px-3 file:py-1 file:text-white file:text-xs"
            disabled={uploading}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--color-gray-600)]">Run ID</label>
          <input
            type="text"
            value={runId}
            onChange={(e) => setRunId(e.target.value)}
            placeholder="e.g. AzureEntra-20260214-210217"
            className="mt-1 w-48 rounded border border-[var(--color-border)] px-2 py-1.5 text-sm"
            disabled={uploading}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--color-gray-600)]">Collected at</label>
          <input
            type="datetime-local"
            value={collectedAt}
            onChange={(e) => setCollectedAt(e.target.value)}
            className="mt-1 rounded border border-[var(--color-border)] px-2 py-1.5 text-sm"
            disabled={uploading}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--color-gray-600)]">
          <input
            type="checkbox"
            checked={replaceExisting}
            onChange={(e) => setReplaceExisting(e.target.checked)}
            disabled={uploading}
            className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-blue-accent)]"
          />
          Replace if already imported
        </label>
        <button
          type="submit"
          disabled={uploading || !file || !runId.trim() || !collectedAt.trim()}
          className="rounded-lg bg-[var(--color-blue-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-[var(--color-status-red)]">{error}</p>}
      {result && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="font-medium text-green-800">Report imported successfully</p>
          <p className="mt-1 text-sm text-green-700">
            {result.findings_count} check{result.findings_count !== 1 ? "s" : ""} processed:{" "}
            <span className="font-medium">{result.passed_count} passed</span>
            {result.failed_count > 0 && (
              <>, <span className="font-medium text-amber-700">{result.failed_count} failed</span></>
            )}
            .
          </p>
          {result.poam_entries_created > 0 && (
            <p className="mt-2 text-sm text-green-700">
              {result.poam_entries_created} POA&M entr{result.poam_entries_created === 1 ? "y" : "ies"} created for controls that failed or are satisfied only by attestation.
              <Link
                href="/dashboard/poam"
                className="ml-1 font-medium text-green-800 underline hover:no-underline"
              >
                View POA&M
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function AzureInheritedCollapsible() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/50 px-3 py-2 text-left text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-100)]/50"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
        )}
        <Shield className="h-4 w-4 text-[var(--color-blue-accent)]" aria-hidden />
        Azure Inherited (5) controls
      </button>
      {open && (
        <ul className="mt-2 space-y-2 border-t border-[var(--color-border-muted)] pt-2" role="list">
          {AZURE_INHERITED_3_10_BASELINE.map((entry) => (
            <li
              key={entry.controlId}
              className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/50 px-3 py-2 text-sm"
            >
              <span className="font-medium text-[var(--color-gray-700)]">{entry.controlId}</span>
              <span className="ml-2 text-[var(--color-gray-600)]">{entry.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AzureControlsCollapsible() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/50 px-3 py-2 text-left text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-100)]/50"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
        )}
        <Shield className="h-4 w-4 text-[var(--color-blue-accent)]" aria-hidden />
        Azure/Entra baseline — 7 controls
      </button>
      {open && (
        <ul className="mt-2 space-y-2 border-t border-[var(--color-border-muted)] pt-2" role="list">
          {AZURE_ENTRA_BASELINE.map((entry) => (
            <li
              key={entry.controlId}
              className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/50 px-3 py-2 text-sm"
            >
              <span className="font-medium text-[var(--color-gray-700)]">{entry.controlId}</span>
              <span className="ml-2 text-[var(--color-gray-600)]">{entry.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type CloudProviderValue = "microsoft" | "google" | "azure";

export function CloudHostingCard({
  boundaryId,
  cloudProvider,
  azureEnvironment,
}: {
  boundaryId: string;
  cloudProvider: string | null;
  azureEnvironment: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<CloudProviderValue | "">("");
  const [azureEnv, setAzureEnv] = useState<"gov" | "commercial" | "">("");
  const [saving, setSaving] = useState(false);

  const hasProvider = Boolean(cloudProvider);
  const showAzureEnv = provider === "microsoft" || provider === "azure";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!provider) return;
    setSaving(true);
    try {
      const body: { cloud_provider: string; azure_environment?: string | null } = {
        cloud_provider: provider,
      };
      body.azure_environment =
        showAzureEnv && (azureEnv === "gov" || azureEnv === "commercial") ? azureEnv : null;
      const res = await fetch(`/api/os-baselines/boundaries/${boundaryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save");
      }
      setOpen(false);
      setProvider("");
      setAzureEnv("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const cardClass =
    "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm";

  if (hasProvider) {
    return (
      <section className={cardClass}>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--color-gray-800)]">
          <Cloud className="h-5 w-5 text-[var(--color-gray-500)]" aria-hidden />
          Cloud hosting
        </h2>
        <p className="mt-1 text-sm text-[var(--color-gray-600)]">
          {cloudProvider === "microsoft"
            ? "Microsoft"
            : cloudProvider === "azure"
              ? "Azure"
              : cloudProvider === "google"
                ? "Google"
                : cloudProvider}
          {azureEnvironment && (
            <span className="ml-1">
              · {azureEnvironment === "gov" ? "Azure Government" : "Azure Commercial"}
            </span>
          )}
        </p>
        {(cloudProvider === "microsoft" || cloudProvider === "azure") && (
          <>
            <AzureInheritedCollapsible />
            <AzureControlsCollapsible />
            <AzureEntraBulkUpload boundaryId={boundaryId} />
          </>
        )}
      </section>
    );
  }

  return (
    <section className={cardClass}>
      <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--color-gray-800)]">
        <Cloud className="h-5 w-5 text-[var(--color-gray-500)]" aria-hidden />
        Cloud hosting
      </h2>
      <p className="mt-1 text-sm text-[var(--color-gray-600)]">
        Identify the cloud provider for this boundary to attach platform control evidence.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
      >
        <PlusCircle className="h-4 w-4" />
        Add cloud provider
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => !saving && setOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[var(--color-gray-900)]">
              Add cloud provider
            </h3>
            <p className="mt-1 text-sm text-[var(--color-gray-600)]">
              Choose the cloud hosting for this boundary. For Microsoft or Azure, you can then upload Azure/Entra evidence.
            </p>
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--color-gray-700)]">
                  Cloud provider
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(["microsoft", "google", "azure"] as const).map((value) => (
                    <label
                      key={value}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-colors has-[:checked]:border-[var(--color-blue-accent)] has-[:checked]:bg-[var(--color-blue-accent)]/5 ${
                        provider === value
                          ? "border-[var(--color-blue-accent)] bg-[var(--color-blue-accent)]/5"
                          : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-gray-300)]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="cloud_provider"
                        value={value}
                        checked={provider === value}
                        onChange={() => {
                          setProvider(value);
                          if (value !== "microsoft" && value !== "azure") setAzureEnv("");
                        }}
                        className="h-4 w-4 border-[var(--color-border)] text-[var(--color-blue-accent)] focus:ring-[var(--color-blue-accent)]"
                      />
                      {value === "microsoft" ? "Microsoft" : value === "google" ? "Google" : "Azure"}
                    </label>
                  ))}
                </div>
              </div>
              {(provider === "microsoft" || provider === "azure") && (
                <div>
                  <label className="block text-sm font-medium text-[var(--color-gray-700)]">
                    Azure environment
                  </label>
                  <div className="mt-2 flex flex-wrap gap-3">
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border-2 px-4 py-2.5 text-sm transition-colors has-[:checked]:border-[var(--color-blue-accent)] has-[:checked]:bg-[var(--color-blue-accent)]/5">
                      <input
                        type="radio"
                        name="azure_env"
                        value="gov"
                        checked={azureEnv === "gov"}
                        onChange={() => setAzureEnv("gov")}
                        className="h-4 w-4 border-[var(--color-border)] text-[var(--color-blue-accent)] focus:ring-[var(--color-blue-accent)]"
                      />
                      <Building2 className="h-4 w-4 text-[var(--color-gray-600)]" aria-hidden />
                      Azure Government
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border-2 px-4 py-2.5 text-sm transition-colors has-[:checked]:border-[var(--color-blue-accent)] has-[:checked]:bg-[var(--color-blue-accent)]/5">
                      <input
                        type="radio"
                        name="azure_env"
                        value="commercial"
                        checked={azureEnv === "commercial"}
                        onChange={() => setAzureEnv("commercial")}
                        className="h-4 w-4 border-[var(--color-border)] text-[var(--color-blue-accent)] focus:ring-[var(--color-blue-accent)]"
                      />
                      <Cloud className="h-4 w-4 text-[var(--color-gray-600)]" aria-hidden />
                      Azure Commercial
                    </label>
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => !saving && setOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-100)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !provider}
                  className="rounded-lg bg-[var(--color-blue-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Add cloud provider"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
