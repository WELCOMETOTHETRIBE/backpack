"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Cloud, Shield, PlusCircle, Building2 } from "lucide-react";
import { AZURE_ENTRA_BASELINE } from "@/lib/compliance/azure-entra-controls";

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
          <div className="mt-4">
            <p className="flex items-center gap-2 text-sm font-medium text-[var(--color-gray-700)]">
              <Shield className="h-4 w-4 text-[var(--color-blue-accent)]" aria-hidden />
              Azure/Entra baseline — 7 controls
            </p>
            <ul className="mt-2 space-y-2" role="list">
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
          </div>
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
        Identify the cloud provider for this boundary (e.g. Azure) to attach Azure/Entra control evidence.
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
