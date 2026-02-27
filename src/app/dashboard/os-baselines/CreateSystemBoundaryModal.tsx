"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  FileText,
  Server,
  Cloud,
  Check,
  Shield,
  Building2,
} from "lucide-react";
import { AZURE_ENTRA_BASELINE } from "@/lib/compliance/azure-entra-controls";

const SCOPE_OPTIONS = [
  {
    value: "microsoft_office",
    label: "Microsoft Office",
    description: "Office 365 / Microsoft 365 (email, documents, collaboration in scope).",
    icon: FileText,
  },
  {
    value: "windows_server_vm",
    label: "Windows Server VM(s)",
    description: "Windows Server systems (on-prem or IaaS) in this enclave.",
    icon: Server,
  },
  {
    value: "azure_cloud",
    label: "Azure Cloud",
    description: "Azure workloads (IaaS/PaaS); identity and access via Entra ID.",
    icon: Cloud,
  },
] as const;

type ScopeValue = (typeof SCOPE_OPTIONS)[number]["value"];

export function CreateSystemBoundaryModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scopeComponents, setScopeComponents] = useState<ScopeValue[]>([]);
  const [azureEnvironment, setAzureEnvironment] = useState<"gov" | "commercial" | "">("");
  const [saving, setSaving] = useState(false);

  const hasAzure = scopeComponents.includes("azure_cloud");

  function toggleScope(value: ScopeValue) {
    setScopeComponents((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]
    );
    if (value === "azure_cloud") setAzureEnvironment("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/os-baselines/boundaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          scope_components: scopeComponents.length > 0 ? scopeComponents : undefined,
          azure_environment:
            hasAzure && (azureEnvironment === "gov" || azureEnvironment === "commercial")
              ? azureEnvironment
              : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create boundary");
      }
      setName("");
      setDescription("");
      setScopeComponents([]);
      setAzureEnvironment("");
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => !saving && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-boundary-title"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-[var(--color-border)] px-6 py-4">
          <div>
            <h2
              id="create-boundary-title"
              className="text-xl font-semibold text-[var(--color-navy-primary)]"
            >
              Create system boundary
            </h2>
            <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">
              Define the name and scope of your CUI enclave.
            </p>
          </div>
          <button
            type="button"
            onClick={() => !saving && onClose()}
            className="rounded-lg p-2 text-[var(--color-gray-500)] transition-colors hover:bg-[var(--color-gray-100)] hover:text-[var(--color-gray-700)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-blue-accent)]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-6 px-6 py-5">
            {/* Section 1 — Name and description */}
            <section>
              <h3 className="text-sm font-medium text-[var(--color-gray-700)]">
                Name and description
              </h3>
              <div className="mt-3 space-y-3">
                <div>
                  <label htmlFor="boundary-name" className="block text-sm font-medium text-[var(--color-gray-700)]">
                    Name <span className="text-[var(--color-status-red)]">*</span>
                  </label>
                  <input
                    id="boundary-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-blue-accent)]"
                    placeholder="e.g. CUI Enclave East"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="boundary-desc" className="block text-sm font-medium text-[var(--color-gray-700)]">
                    Description <span className="text-[var(--color-gray-500)]">(optional)</span>
                  </label>
                  <textarea
                    id="boundary-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-blue-accent)]"
                    rows={2}
                  />
                </div>
              </div>
            </section>

            {/* Section 2 — What's in this boundary */}
            <section className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-surface-muted)]/50 p-4">
              <h3 className="text-sm font-medium text-[var(--color-gray-700)]">
                What&apos;s in this boundary?
              </h3>
              <p className="mt-0.5 text-xs text-[var(--color-gray-600)]">
                Select all components that are in scope for this enclave.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {SCOPE_OPTIONS.map((opt) => {
                  const selected = scopeComponents.includes(opt.value);
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleScope(opt.value)}
                      className={`flex flex-col items-start rounded-xl border-2 p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-blue-accent)] ${
                        selected
                          ? "border-[var(--color-blue-accent)] bg-[var(--color-blue-accent)]/5"
                          : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-gray-300)]"
                      }`}
                      aria-pressed={selected}
                    >
                      <span className="flex w-full items-center justify-between">
                        <Icon
                          className={`h-5 w-5 ${selected ? "text-[var(--color-blue-accent)]" : "text-[var(--color-gray-500)]"}`}
                          aria-hidden
                        />
                        {selected && (
                          <Check className="h-5 w-5 text-[var(--color-blue-accent)]" aria-hidden />
                        )}
                      </span>
                      <span className="mt-2 font-medium text-[var(--color-gray-900)]">
                        {opt.label}
                      </span>
                      <span className="mt-0.5 text-xs text-[var(--color-gray-600)]">
                        {opt.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Section 3 — Azure environment (conditional) */}
            {hasAzure && (
              <section className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-surface-muted)]/50 p-4">
                <h3 className="text-sm font-medium text-[var(--color-gray-700)]">
                  Azure environment
                </h3>
                <p className="mt-0.5 text-xs text-[var(--color-gray-600)]">
                  Government for FedRAMP/sovereignty; Commercial for standard workloads.
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border-2 px-4 py-2.5 transition-colors has-[:checked]:border-[var(--color-blue-accent)] has-[:checked]:bg-[var(--color-blue-accent)]/5">
                    <input
                      type="radio"
                      name="azure_env"
                      value="gov"
                      checked={azureEnvironment === "gov"}
                      onChange={() => setAzureEnvironment("gov")}
                      className="h-4 w-4 border-[var(--color-border)] text-[var(--color-blue-accent)] focus:ring-[var(--color-blue-accent)]"
                    />
                    <Building2 className="h-4 w-4 text-[var(--color-gray-600)]" aria-hidden />
                    <span className="text-sm font-medium">Azure Government</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border-2 px-4 py-2.5 transition-colors has-[:checked]:border-[var(--color-blue-accent)] has-[:checked]:bg-[var(--color-blue-accent)]/5">
                    <input
                      type="radio"
                      name="azure_env"
                      value="commercial"
                      checked={azureEnvironment === "commercial"}
                      onChange={() => setAzureEnvironment("commercial")}
                      className="h-4 w-4 border-[var(--color-border)] text-[var(--color-blue-accent)] focus:ring-[var(--color-blue-accent)]"
                    />
                    <Cloud className="h-4 w-4 text-[var(--color-gray-600)]" aria-hidden />
                    <span className="text-sm font-medium">Azure Commercial</span>
                  </label>
                </div>
              </section>
            )}

            {/* Section 4 — Azure/Entra baseline (conditional) */}
            {hasAzure && (
              <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <h3 className="flex items-center gap-2 text-sm font-medium text-[var(--color-gray-700)]">
                  <Shield className="h-4 w-4 text-[var(--color-blue-accent)]" aria-hidden />
                  Azure/Entra baseline — 7 controls
                </h3>
                <p className="mt-0.5 text-xs text-[var(--color-gray-600)]">
                  Configuration in Entra ID and Azure satisfies these NIST 800-171 requirements.
                </p>
                <ul className="mt-4 space-y-3" role="list">
                  {AZURE_ENTRA_BASELINE.map((entry) => (
                    <li
                      key={entry.controlId}
                      className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/50 px-3 py-2.5"
                    >
                      <span className="text-xs font-medium text-[var(--color-gray-500)]">
                        {entry.controlId}
                      </span>
                      <span className="ml-2 font-medium text-[var(--color-gray-900)]">
                        {entry.title}
                      </span>
                      <p className="mt-1 text-xs text-[var(--color-gray-600)]">
                        {entry.azureConfigurationRequirement}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* Footer actions */}
          <div className="flex shrink-0 justify-end gap-3 border-t border-[var(--color-border)] px-6 py-4">
            <button
              type="button"
              onClick={() => !saving && onClose()}
              className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-100)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-blue-accent)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="rounded-lg bg-[var(--color-blue-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-blue-accent)]"
            >
              {saving ? "Creating…" : "Create boundary"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
