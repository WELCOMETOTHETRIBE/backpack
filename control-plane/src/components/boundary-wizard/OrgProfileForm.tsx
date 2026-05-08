"use client";

/**
 * OrgProfileForm — slim replacement for BoundaryScopingWizard.
 *
 * Codex is exclusively for MacTech CUI Vault customers, so the boundary
 * architecture is a constant: Win 2025 Datacenter on Azure Government
 * FedRAMP High. There's nothing to "scope" — the old 6-step wizard
 * (1062 lines) was a relic from when this tool was generic. This form
 * keeps only the fields that are genuinely customer-specific:
 *
 *   1. System Identity — name, description, system owner, ISSO
 *      (also captured during onboarding Phase 1; this is the edit surface)
 *   2. CUI Categories — what kinds of CUI are in scope
 *   3. External Service Providers — additional providers beyond Azure Gov
 *      (Google Workspace, Salesforce, etc.) and their inherited controls
 *   4. Network Narrative — supplemental SSP boundary text
 *
 * Dropped from the old wizard:
 *   - Step 3 "Asset Scope" (hardware/software/cloud/network) — every
 *     CUI Vault customer's scope is identical, so asking is busywork
 *
 * Saves to the same /api/boundary/scope endpoint the old wizard used,
 * so the data shape is unchanged.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Plus,
  Save,
  Trash2,
  Loader2,
} from "lucide-react";

const CUI_CATEGORIES = [
  { id: "CTI", label: "Controlled Technical Information (CTI)" },
  { id: "ITAR", label: "Export Controlled (ITAR/EAR)" },
  { id: "FOR_OFFICIAL_USE", label: "For Official Use Only (FOUO)" },
  { id: "PRIVACY_PII", label: "Privacy / Personally Identifiable Information (PII)" },
  { id: "PROCUREMENT", label: "Procurement & Acquisition" },
  { id: "CRITICAL_INFRA", label: "Critical Infrastructure" },
  { id: "INTEL", label: "Intelligence" },
  { id: "LAW_ENFORCEMENT", label: "Law Enforcement" },
  { id: "LEGAL", label: "Legal" },
  { id: "FINANCIAL", label: "Financial" },
  { id: "NUCLEAR", label: "Nuclear" },
  { id: "TRANSPORT", label: "Transportation" },
  { id: "HEALTH", label: "Health Information" },
  { id: "RESEARCH", label: "Research" },
  { id: "CONTRACTS", label: "Contract Information" },
  { id: "PROPRIETARY", label: "Proprietary Business Information" },
  { id: "SBU_TECH", label: "Sensitive but Unclassified — Technical" },
] as const;

const SERVICE_TYPES = [
  "Cloud Infrastructure (IaaS)",
  "Platform Services (PaaS)",
  "SaaS Application",
  "Managed Security Services",
  "IT Support / Help Desk",
  "Network / Connectivity",
  "Identity & Access Management",
  "Backup & Recovery",
  "Email & Collaboration",
  "Other",
] as const;

interface ExternalProvider {
  id: string;
  name: string;
  serviceType: string;
  dataTypes: string[];
  inheritedControls: string[];
  website?: string;
}

interface OrgProfileFormProps {
  initialData: {
    systemName: string;
    systemDescription: string;
    authorizationBoundaryStatement: string;
    systemOwnerName: string;
    systemOwnerEmail: string;
    issoName: string;
    issoEmail: string;
    cuiCategories: string[];
    externalServiceProviders: Omit<ExternalProvider, "id">[];
    boundaryNarrative: string;
  };
  onComplete?: () => void;
}

const fieldClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2.5 text-sm text-[var(--color-gray-900)] placeholder:text-[var(--color-gray-500)] focus:border-[var(--color-navy-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-navy-primary)]/10 transition-colors";
const labelClass = "mb-1.5 block text-[13px] font-medium text-[var(--color-gray-700)]";
const sectionHeadingClass = "text-base font-semibold text-[var(--color-gray-900)]";
const cardClass =
  "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm";

export function OrgProfileForm({ initialData, onComplete }: OrgProfileFormProps) {
  const router = useRouter();

  // Hydrate providers with stable client-side keys
  const seededProviders = useMemo<ExternalProvider[]>(
    () =>
      (initialData.externalServiceProviders ?? []).map((p, i) => ({
        ...p,
        id: `provider-${i}-${p.name}`,
      })),
    [initialData.externalServiceProviders]
  );

  const [systemName, setSystemName] = useState(initialData.systemName);
  const [systemDescription, setSystemDescription] = useState(initialData.systemDescription);
  const [systemOwnerName, setSystemOwnerName] = useState(initialData.systemOwnerName);
  const [systemOwnerEmail, setSystemOwnerEmail] = useState(initialData.systemOwnerEmail);
  const [issoName, setIssoName] = useState(initialData.issoName);
  const [issoEmail, setIssoEmail] = useState(initialData.issoEmail);
  const [cuiCategories, setCuiCategories] = useState<string[]>(initialData.cuiCategories);
  const [providers, setProviders] = useState<ExternalProvider[]>(seededProviders);
  const [boundaryNarrative, setBoundaryNarrative] = useState(initialData.boundaryNarrative);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedJustNow, setSavedJustNow] = useState(false);

  function toggleCategory(id: string) {
    setCuiCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  function addProvider() {
    setProviders((prev) => [
      ...prev,
      {
        id: `provider-${Date.now()}`,
        name: "",
        serviceType: SERVICE_TYPES[0],
        dataTypes: [],
        inheritedControls: [],
      },
    ]);
  }

  function updateProvider(id: string, patch: Partial<ExternalProvider>) {
    setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function removeProvider(id: string) {
    setProviders((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleSave() {
    setSaveError(null);
    setSaving(true);
    setSavedJustNow(false);
    try {
      const body = {
        systemName,
        systemDescription,
        systemOwnerName,
        systemOwnerEmail,
        issoName,
        issoEmail,
        cuiCategories,
        externalServiceProviders: providers.map(({ id, ...p }) => {
          void id;
          return p;
        }),
        boundaryNarrative,
        markComplete: true,
      };
      const res = await fetch("/api/boundary/scope", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaveError(err.error ?? "Failed to save. Please try again.");
        return;
      }
      setSavedJustNow(true);
      router.refresh();
      if (onComplete) {
        // small delay so the success state is visible before navigation
        setTimeout(() => onComplete(), 800);
      }
    } catch {
      setSaveError("Network error. Please check your connection.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-[var(--color-gray-900)]">
          Edit organization profile
        </h1>
        <p className="mt-2 text-sm text-[var(--color-gray-600)]">
          The boundary architecture is fixed (Win 2025 Datacenter on Azure
          Government). These fields capture the customer-specific information
          that feeds the SSP and the C3PAO interview pack.
        </p>
      </header>

      {/* ── Section 1: System identity ────────────────────────────────────── */}
      <section className={cardClass}>
        <h2 className={sectionHeadingClass}>System identity</h2>
        <p className="mt-0.5 mb-4 text-sm text-[var(--color-gray-600)]">
          Auto-populated from onboarding. Edit if anything changes.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>System Name *</label>
            <input
              type="text"
              value={systemName}
              onChange={(e) => setSystemName(e.target.value)}
              className={fieldClass}
              placeholder="e.g. Acme CUI Vault — Azure Government Enclave"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>System Description</label>
            <textarea
              value={systemDescription}
              onChange={(e) => setSystemDescription(e.target.value)}
              rows={3}
              className={fieldClass}
              placeholder="2–4 sentence narrative of the system, its purpose, and the workforce that accesses it."
            />
          </div>
          <div>
            <label className={labelClass}>System Owner Name *</label>
            <input
              type="text"
              value={systemOwnerName}
              onChange={(e) => setSystemOwnerName(e.target.value)}
              className={fieldClass}
              required
            />
          </div>
          <div>
            <label className={labelClass}>System Owner Email *</label>
            <input
              type="email"
              value={systemOwnerEmail}
              onChange={(e) => setSystemOwnerEmail(e.target.value)}
              className={fieldClass}
              required
            />
          </div>
          <div>
            <label className={labelClass}>ISSO Name</label>
            <input
              type="text"
              value={issoName}
              onChange={(e) => setIssoName(e.target.value)}
              className={fieldClass}
              placeholder="Customer-designated ISSO (or MacTech via signed MSP agreement)"
            />
          </div>
          <div>
            <label className={labelClass}>ISSO Email</label>
            <input
              type="email"
              value={issoEmail}
              onChange={(e) => setIssoEmail(e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>
      </section>

      {/* ── Section 2: CUI categories ────────────────────────────────────── */}
      <section className={cardClass}>
        <h2 className={sectionHeadingClass}>CUI categories in scope</h2>
        <p className="mt-0.5 mb-4 text-sm text-[var(--color-gray-600)]">
          Which CUI types does this system process? Check all that apply.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {CUI_CATEGORIES.map((cat) => {
            const checked = cuiCategories.includes(cat.id);
            return (
              <label
                key={cat.id}
                className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm transition-colors ${
                  checked
                    ? "border-[var(--color-navy-primary)] bg-[var(--color-navy-primary)]/5"
                    : "border-[var(--color-border)] hover:bg-[var(--color-gray-50)]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleCategory(cat.id)}
                  className="mt-0.5 h-4 w-4"
                />
                <span className="flex-1 text-[var(--color-gray-800)]">{cat.label}</span>
              </label>
            );
          })}
        </div>
      </section>

      {/* ── Section 3: External providers ────────────────────────────────── */}
      <section className={cardClass}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className={sectionHeadingClass}>External service providers</h2>
            <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">
              Azure Government is the canonical provider (5 inherited 3.10
              controls). Add any other providers you depend on (Google
              Workspace, Salesforce, etc.) and the controls they inherit for you.
            </p>
          </div>
          <button
            type="button"
            onClick={addProvider}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-navy-primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
          >
            <Plus className="h-4 w-4" />
            Add provider
          </button>
        </div>

        {providers.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-gray-500)]">
            No additional providers declared. Azure Government inheritance is
            applied automatically; add others as needed.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {providers.map((p) => (
              <div
                key={p.id}
                className="rounded-lg border border-[var(--color-border)] bg-white p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="grid flex-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>Provider name</label>
                      <input
                        type="text"
                        value={p.name}
                        onChange={(e) =>
                          updateProvider(p.id, { name: e.target.value })
                        }
                        className={fieldClass}
                        placeholder="e.g. Google Workspace"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Service type</label>
                      <select
                        value={p.serviceType}
                        onChange={(e) =>
                          updateProvider(p.id, { serviceType: e.target.value })
                        }
                        className={fieldClass}
                      >
                        {SERVICE_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>
                        Inherited controls (comma-separated NIST IDs)
                      </label>
                      <input
                        type="text"
                        value={p.inheritedControls.join(", ")}
                        onChange={(e) =>
                          updateProvider(p.id, {
                            inheritedControls: e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                        className={fieldClass}
                        placeholder="e.g. 3.13.8, 3.5.3"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeProvider(p.id)}
                    className="shrink-0 rounded-md p-1.5 text-[var(--color-gray-400)] hover:bg-red-50 hover:text-red-600"
                    aria-label="Remove provider"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Section 4: Network narrative ─────────────────────────────────── */}
      <section className={cardClass}>
        <h2 className={sectionHeadingClass}>Network boundary narrative</h2>
        <p className="mt-0.5 mb-4 text-sm text-[var(--color-gray-600)]">
          Supplemental free-text for the SSP. Describe how users connect to the
          enclave and any non-default network topology. The canonical answer
          (&ldquo;Azure Bastion → managed Windows endpoint&rdquo;) is already in
          your boundary statement.
        </p>
        <textarea
          value={boundaryNarrative}
          onChange={(e) => setBoundaryNarrative(e.target.value)}
          rows={5}
          className={fieldClass}
          placeholder="Optional. e.g., describe office locations, network egress controls, monitoring approach."
        />
      </section>

      {/* ── Save ─────────────────────────────────────────────────────────── */}
      {saveError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        {savedJustNow && (
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Saved
          </span>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-navy-primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save profile
            </>
          )}
        </button>
      </div>
    </div>
  );
}
