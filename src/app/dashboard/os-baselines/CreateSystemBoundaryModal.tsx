"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  ChevronRight,
  ChevronLeft,
  Shield,
  Cloud,
  Server,
  Building2,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import type { ScopeComponent } from "@/types/boundary";

// ─── MacTech CUI Vault pre-configured scope ──────────────────────────────────
const MACTECH_SCOPE: ScopeComponent[] = [
  "windows_server_vm",
  "azure_cloud",
  "identity_provider",
  "privileged_access_management",
  "remote_access_bastion",
  "network_security_grouping",
  "siem_logging",
  "endpoint_detection_response",
  "vulnerability_management",
  "configuration_compliance",
  "key_management",
  "backup_recovery",
];

const MACTECH_INCLUSIONS = [
  "Azure Government hosting (FedRAMP High authorized)",
  "Windows Server 2025 Datacenter (DISA STIG baseline applied)",
  "Entra ID with Conditional Access + MFA",
  "Azure Bastion — no public RDP exposure",
  "Microsoft Defender for Endpoint (MDE)",
  "Azure Monitor + Log Analytics + Sentinel",
  "Azure Key Vault (encryption key management)",
  "Azure Backup (tested restore)",
  "Defender for Cloud (vulnerability management)",
  "BitLocker OS/data disk encryption with key escrow",
];

// ─── Types ───────────────────────────────────────────────────────────────────
type HostingPath = "mactech" | "azure" | "on_prem" | "other";
type AzureEnv = "gov" | "commercial";
type OsType = "windows" | "linux" | "mixed";

interface AzureScopeOptions {
  hasBastion: boolean;
  hasDefender: boolean;
  hasSiem: boolean;
  hasBackup: boolean;
  hasKeyVault: boolean;
}

// ─── Hosting path option cards ───────────────────────────────────────────────
const HOSTING_OPTIONS: {
  id: HostingPath;
  label: string;
  sublabel: string;
  icon: React.FC<{ className?: string }>;
  badge?: string;
  description: string;
}[] = [
  {
    id: "mactech",
    label: "MacTech Solutions Secure CUI Vault",
    sublabel: "Windows Server 2025 · Azure Government",
    icon: Sparkles,
    badge: "Recommended",
    description:
      "Pre-configured CMMC-ready enclave hosted by MacTech Solutions. Azure Gov, STIG-hardened Windows Server 2025, Entra ID, MDE, Sentinel — all wired up.",
  },
  {
    id: "azure",
    label: "Azure (self-managed)",
    sublabel: "Azure Government or Commercial",
    icon: Cloud,
    description:
      "Your own Azure subscription. Choose Government or Commercial, then select the security services you have deployed.",
  },
  {
    id: "on_prem",
    label: "On-Premises",
    sublabel: "Physical servers or local VMs",
    icon: Server,
    description:
      "CUI endpoints at your facility — bare-metal, Hyper-V, VMware, etc. No cloud provider required.",
  },
  {
    id: "other",
    label: "Other / Hybrid",
    sublabel: "Mixed environments",
    icon: Building2,
    description:
      "CUI spans multiple environments or a cloud provider not listed above. You'll configure scope manually.",
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function azureScopeToComponents(opts: AzureScopeOptions): ScopeComponent[] {
  const out: ScopeComponent[] = [
    "windows_server_vm",
    "azure_cloud",
    "identity_provider",
    "network_security_grouping",
  ];
  if (opts.hasBastion) out.push("remote_access_bastion");
  if (opts.hasDefender) {
    out.push("endpoint_detection_response");
    out.push("vulnerability_management");
  }
  if (opts.hasSiem) out.push("siem_logging");
  if (opts.hasBackup) out.push("backup_recovery");
  if (opts.hasKeyVault) out.push("key_management");
  return out;
}

function onPremScopeFromOs(os: OsType): ScopeComponent[] {
  const out: ScopeComponent[] = [];
  if (os === "windows" || os === "mixed") out.push("windows_server_vm");
  if (os === "linux" || os === "mixed") out.push("linux_server_vm");
  out.push("identity_provider", "network_devices", "vpn_gateway");
  return out;
}

// ─── Component ───────────────────────────────────────────────────────────────
export function CreateSystemBoundaryModal({
  open,
  onClose,
  preselect,
}: {
  open: boolean;
  onClose: () => void;
  preselect?: HostingPath;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(preselect ? 2 : 1);

  // Step 1
  const [hostingPath, setHostingPath] = useState<HostingPath | null>(preselect ?? null);

  // Step 2 — common
  const [name, setName] = useState(
    preselect === "mactech" ? "MacTech Secure CUI Vault" :
    preselect === "azure" ? "Azure CUI Enclave" :
    preselect === "on_prem" ? "On-Premises CUI Enclave" :
    ""
  );
  const [description, setDescription] = useState("");

  // Step 2 — Azure-specific
  const [azureEnv, setAzureEnv] = useState<AzureEnv>("gov");
  const [azureOs, setAzureOs] = useState<OsType>("windows");
  const [azureOpts, setAzureOpts] = useState<AzureScopeOptions>({
    hasBastion: true,
    hasDefender: true,
    hasSiem: true,
    hasBackup: false,
    hasKeyVault: false,
  });

  // Step 2 — On-prem specific
  const [onPremOs, setOnPremOs] = useState<OsType>("windows");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep(preselect ? 2 : 1);
    setHostingPath(preselect ?? null);
    setName(preselect === "mactech" ? "MacTech Secure CUI Vault" : "");
    setDescription("");
    setAzureEnv("gov");
    setAzureOs("windows");
    setAzureOpts({ hasBastion: true, hasDefender: true, hasSiem: true, hasBackup: false, hasKeyVault: false });
    setOnPremOs("windows");
    setError(null);
  }

  function handleClose() {
    if (saving) return;
    reset();
    onClose();
  }

  function handleSelectPath(path: HostingPath) {
    setHostingPath(path);
    // Pre-fill boundary name based on path
    if (path === "mactech" && !name) setName("MacTech Secure CUI Vault");
    else if (path === "azure" && !name) setName("Azure CUI Enclave");
    else if (path === "on_prem" && !name) setName("On-Premises CUI Enclave");
    setStep(2);
  }

  function buildPayload() {
    if (!hostingPath) return null;
    let scope_components: ScopeComponent[] = [];
    let azure_environment: AzureEnv | undefined;
    let cloud_provider: string | undefined;

    if (hostingPath === "mactech") {
      scope_components = MACTECH_SCOPE;
      azure_environment = "gov";
      cloud_provider = "azure";
    } else if (hostingPath === "azure") {
      scope_components = azureScopeToComponents(azureOpts);
      if (azureOs === "linux") {
        scope_components = scope_components.filter((s) => s !== "windows_server_vm");
        scope_components.push("linux_server_vm");
      } else if (azureOs === "mixed") {
        scope_components.push("linux_server_vm");
      }
      azure_environment = azureEnv;
      cloud_provider = "azure";
    } else if (hostingPath === "on_prem") {
      scope_components = onPremScopeFromOs(onPremOs);
    } else {
      scope_components = [];
    }

    return {
      name: name.trim(),
      description: description.trim() || undefined,
      scope_components,
      azure_environment,
      cloud_provider,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !hostingPath) return;
    setError(null);
    setSaving(true);
    try {
      const payload = buildPayload();
      const res = await fetch("/api/os-baselines/boundaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create boundary");
      }
      reset();
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-boundary-title"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <div>
            <h2 id="create-boundary-title" className="text-xl font-semibold text-[var(--color-navy-primary)]">
              {step === 1 ? "Define your CUI enclave" : "Configure your boundary"}
            </h2>
            <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">
              {step === 1
                ? "Where is the system that handles your CUI hosted?"
                : HOSTING_OPTIONS.find((o) => o.id === hostingPath)?.label}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-2 text-[var(--color-gray-500)] transition-colors hover:bg-[var(--color-gray-100)] hover:text-[var(--color-gray-700)]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex shrink-0 gap-1 px-6 pt-3">
          {([1, 2] as const).map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                s <= step ? "bg-[var(--color-blue-accent)]" : "bg-[var(--color-gray-200)]"
              }`}
            />
          ))}
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {step === 1 && (
            <div className="space-y-3 px-6 py-5">
              {HOSTING_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectPath(opt.id)}
                    className={`group relative w-full rounded-xl border-2 p-4 text-left transition-all hover:border-[var(--color-blue-accent)] hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-blue-accent)] ${
                      opt.id === "mactech"
                        ? "border-[var(--color-blue-accent)] bg-[var(--color-blue-accent)]/[0.04]"
                        : "border-[var(--color-border)] bg-[var(--color-surface)]"
                    }`}
                  >
                    {opt.badge && (
                      <span className="absolute right-3 top-3 rounded-full bg-[var(--color-blue-accent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                        {opt.badge}
                      </span>
                    )}
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                          opt.id === "mactech"
                            ? "bg-[var(--color-blue-accent)]/10 text-[var(--color-blue-accent)]"
                            : "bg-[var(--color-gray-100)] text-[var(--color-gray-600)]"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1 pr-16">
                        <p className="font-semibold text-[var(--color-gray-900)]">{opt.label}</p>
                        <p className="text-xs font-medium text-[var(--color-gray-500)]">{opt.sublabel}</p>
                        <p className="mt-1 text-sm text-[var(--color-gray-600)]">{opt.description}</p>
                      </div>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[var(--color-gray-400)] transition-colors group-hover:text-[var(--color-blue-accent)]" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {step === 2 && (
            <form id="boundary-form" onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
              {/* Name + description */}
              <section className="space-y-3">
                <div>
                  <label htmlFor="boundary-name" className="block text-sm font-medium text-[var(--color-gray-700)]">
                    Boundary name <span className="text-[var(--color-status-red)]">*</span>
                  </label>
                  <input
                    id="boundary-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-blue-accent)]"
                    placeholder="e.g. MacTech Secure CUI Vault"
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
                    placeholder="Brief description of the enclave (optional)"
                  />
                </div>
              </section>

              {/* MacTech path: read-only summary */}
              {hostingPath === "mactech" && (
                <section className="rounded-xl border border-[var(--color-blue-accent)]/30 bg-[var(--color-blue-accent)]/[0.04] p-4">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-[var(--color-blue-accent)]" aria-hidden />
                    <h3 className="text-sm font-semibold text-[var(--color-gray-800)]">
                      Pre-configured for CMMC L2 — what&apos;s included
                    </h3>
                  </div>
                  <ul className="mt-3 space-y-1.5" role="list">
                    {MACTECH_INCLUSIONS.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-[var(--color-gray-700)]">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-status-green)]" aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-[var(--color-gray-500)]">
                    Scope components, Azure Government environment, and inherited control allocations are set automatically.
                    You&apos;ll adjudicate your customer-owned controls after setup.
                  </p>
                </section>
              )}

              {/* Azure path: environment + OS + services */}
              {hostingPath === "azure" && (
                <>
                  <section className="space-y-2">
                    <h3 className="text-sm font-medium text-[var(--color-gray-700)]">Azure environment</h3>
                    <div className="flex gap-3">
                      {(["gov", "commercial"] as AzureEnv[]).map((env) => (
                        <label
                          key={env}
                          className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                            azureEnv === env
                              ? "border-[var(--color-blue-accent)] bg-[var(--color-blue-accent)]/5"
                              : "border-[var(--color-border)] hover:border-[var(--color-gray-300)]"
                          }`}
                        >
                          <input
                            type="radio"
                            name="azure_env"
                            value={env}
                            checked={azureEnv === env}
                            onChange={() => setAzureEnv(env)}
                            className="h-4 w-4 text-[var(--color-blue-accent)]"
                          />
                          {env === "gov" ? (
                            <>
                              <Building2 className="h-4 w-4 text-[var(--color-gray-500)]" aria-hidden />
                              Azure Government
                            </>
                          ) : (
                            <>
                              <Cloud className="h-4 w-4 text-[var(--color-gray-500)]" aria-hidden />
                              Azure Commercial
                            </>
                          )}
                        </label>
                      ))}
                    </div>
                    {azureEnv === "commercial" && (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        Azure Government provides FedRAMP High authorization and data sovereignty for DoD CUI.
                        Commercial is acceptable if your CMMC assessor agrees with your scoping rationale.
                      </p>
                    )}
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-sm font-medium text-[var(--color-gray-700)]">Primary OS in scope</h3>
                    <div className="flex gap-2">
                      {(["windows", "linux", "mixed"] as OsType[]).map((os) => (
                        <label
                          key={os}
                          className={`flex flex-1 cursor-pointer items-center justify-center rounded-lg border-2 px-2 py-2 text-sm font-medium capitalize transition-colors ${
                            azureOs === os
                              ? "border-[var(--color-blue-accent)] bg-[var(--color-blue-accent)]/5"
                              : "border-[var(--color-border)] hover:border-[var(--color-gray-300)]"
                          }`}
                        >
                          <input
                            type="radio"
                            name="azure_os"
                            value={os}
                            checked={azureOs === os}
                            onChange={() => setAzureOs(os)}
                            className="sr-only"
                          />
                          {os === "mixed" ? "Windows + Linux" : os === "windows" ? "Windows" : "Linux"}
                        </label>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h3 className="mb-2 text-sm font-medium text-[var(--color-gray-700)]">Security services deployed</h3>
                    <div className="space-y-2">
                      {(
                        [
                          { key: "hasBastion", label: "Azure Bastion (no public RDP/SSH)" },
                          { key: "hasDefender", label: "Microsoft Defender for Endpoint + Defender for Cloud" },
                          { key: "hasSiem", label: "Azure Monitor + Log Analytics (centralized logging)" },
                          { key: "hasBackup", label: "Azure Backup" },
                          { key: "hasKeyVault", label: "Azure Key Vault" },
                        ] as { key: keyof AzureScopeOptions; label: string }[]
                      ).map(({ key, label }) => (
                        <label
                          key={key}
                          className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2.5 transition-colors hover:bg-[var(--color-gray-50)]"
                        >
                          <input
                            type="checkbox"
                            checked={azureOpts[key]}
                            onChange={() => setAzureOpts((prev) => ({ ...prev, [key]: !prev[key] }))}
                            className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-blue-accent)]"
                          />
                          <span className="text-sm text-[var(--color-gray-700)]">{label}</span>
                        </label>
                      ))}
                    </div>
                  </section>
                </>
              )}

              {/* On-prem path */}
              {hostingPath === "on_prem" && (
                <section className="space-y-2">
                  <h3 className="text-sm font-medium text-[var(--color-gray-700)]">Primary OS in scope</h3>
                  <div className="flex gap-2">
                    {(["windows", "linux", "mixed"] as OsType[]).map((os) => (
                      <label
                        key={os}
                        className={`flex flex-1 cursor-pointer items-center justify-center rounded-lg border-2 px-2 py-2 text-sm font-medium capitalize transition-colors ${
                          onPremOs === os
                            ? "border-[var(--color-blue-accent)] bg-[var(--color-blue-accent)]/5"
                            : "border-[var(--color-border)] hover:border-[var(--color-gray-300)]"
                        }`}
                      >
                        <input
                          type="radio"
                          name="on_prem_os"
                          value={os}
                          checked={onPremOs === os}
                          onChange={() => setOnPremOs(os)}
                          className="sr-only"
                        />
                        {os === "mixed" ? "Windows + Linux" : os === "windows" ? "Windows" : "Linux"}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-[var(--color-gray-500)]">
                    You can add individual endpoints (hostnames, roles, OS versions) after creating the boundary.
                  </p>
                </section>
              )}

              {/* Other/hybrid path */}
              {hostingPath === "other" && (
                <p className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-surface-muted)]/50 px-4 py-3 text-sm text-[var(--color-gray-600)]">
                  Your boundary will be created with no pre-configured scope. Add endpoints and scope components
                  manually on the boundary detail page after creation.
                </p>
              )}

              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
              )}
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-[var(--color-border)] px-6 py-4">
          {step === 2 ? (
            <button
              type="button"
              onClick={() => { setStep(1); setError(null); }}
              className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-100)]"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
          ) : (
            <span />
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-100)]"
            >
              Cancel
            </button>
            {step === 2 && (
              <button
                type="submit"
                form="boundary-form"
                disabled={saving || !name.trim()}
                className="rounded-lg bg-[var(--color-blue-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Creating..." : "Create boundary"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
