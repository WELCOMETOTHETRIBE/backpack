"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

type CloudProvider = "" | "none" | "microsoft" | "google" | "azure";

export function EditBoundaryForm({
  boundaryId,
  initialName,
  initialDescription,
  initialCloudProvider,
  initialAzureEnvironment,
}: {
  boundaryId: string;
  initialName: string;
  initialDescription: string | null;
  initialCloudProvider?: string | null;
  initialAzureEnvironment?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [cloudProvider, setCloudProvider] = useState<CloudProvider>(
    (initialCloudProvider && ["none", "microsoft", "google", "azure"].includes(initialCloudProvider)
      ? initialCloudProvider
      : ""
  );
  const [azureEnvironment, setAzureEnvironment] = useState<"gov" | "commercial" | "">(
    initialAzureEnvironment === "gov" || initialAzureEnvironment === "commercial"
      ? initialAzureEnvironment
      : ""
  );
  const [saving, setSaving] = useState(false);

  const showAzureEnv = cloudProvider === "microsoft" || cloudProvider === "azure";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body: {
        name: string;
        description?: string;
        cloud_provider?: string | null;
        azure_environment?: string | null;
      } = {
        name: name.trim(),
        description: description.trim() || undefined,
      };
      body.cloud_provider = cloudProvider && cloudProvider !== "none" ? cloudProvider : null;
      body.azure_environment = showAzureEnv && (azureEnvironment === "gov" || azureEnvironment === "commercial") ? azureEnvironment : null;
      const res = await fetch(`/api/os-baselines/boundaries/${boundaryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update");
      }
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
      >
        <Pencil className="h-4 w-4" />
        Edit boundary
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => !saving && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[var(--color-gray-900)]">Edit boundary</h3>
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--color-gray-700)]">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-gray-700)]">Description (optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-gray-700)]">Cloud hosting (optional)</label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {(["none", "microsoft", "google", "azure"] as const).map((value) => (
                    <label key={value} className="flex cursor-pointer items-center gap-1.5 text-sm">
                      <input
                        type="radio"
                        name="cloud_provider"
                        value={value}
                        checked={cloudProvider === value}
                        onChange={() => {
                          setCloudProvider(value);
                          if (value !== "microsoft" && value !== "azure") setAzureEnvironment("");
                        }}
                        className="h-3.5 w-3.5 border-[var(--color-border)] text-[var(--color-blue-accent)]"
                      />
                      {value === "none" ? "None" : value === "microsoft" ? "Microsoft" : value === "google" ? "Google" : "Azure"}
                    </label>
                  ))}
                </div>
              </div>
              {showAzureEnv && (
                <div>
                  <label className="block text-sm font-medium text-[var(--color-gray-700)]">Azure environment</label>
                  <div className="mt-1 flex gap-3">
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="azure_env"
                        value="gov"
                        checked={azureEnvironment === "gov"}
                        onChange={() => setAzureEnvironment("gov")}
                        className="h-3.5 w-3.5 border-[var(--color-border)] text-[var(--color-blue-accent)]"
                      />
                      Government
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="azure_env"
                        value="commercial"
                        checked={azureEnvironment === "commercial"}
                        onChange={() => setAzureEnvironment("commercial")}
                        className="h-3.5 w-3.5 border-[var(--color-border)] text-[var(--color-blue-accent)]"
                      />
                      Commercial
                    </label>
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-100)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !name.trim()}
                  className="rounded-lg bg-[var(--color-blue-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
