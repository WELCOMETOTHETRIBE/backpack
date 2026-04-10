"use client";

import { useState, useCallback, useEffect } from "react";
import {
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Plus,
  Trash2,
  AlertCircle,
  Info,
  Shield,
  Server,
  Users,
  Globe,
  Network,
  FileText,
  Loader2,
  RefreshCw,
} from "lucide-react";

// ─── CUI Category Definitions ───────────────────────────────────────────────
// Based on the CUI Registry (https://www.archives.gov/cui)
const CUI_CATEGORIES = [
  { id: "CTI", label: "Controlled Technical Information (CTI)", description: "Technical information with military or space application" },
  { id: "ITAR", label: "Export Controlled (ITAR/EAR)", description: "International Traffic in Arms Regulations and Export Administration Regulations" },
  { id: "FOR_OFFICIAL_USE", label: "For Official Use Only (FOUO)", description: "Pre-decisional, deliberative information" },
  { id: "PRIVACY_PII", label: "Privacy — Personally Identifiable Information (PII)", description: "Information that can identify an individual" },
  { id: "PROCUREMENT", label: "Procurement & Acquisition", description: "Source selection, bid/proposal information" },
  { id: "CRITICAL_INFRA", label: "Critical Infrastructure", description: "Physical, cyber, or economic security of US infrastructure" },
  { id: "INTEL", label: "Intelligence", description: "Sensitive intelligence-related information" },
  { id: "LAW_ENFORCEMENT", label: "Law Enforcement", description: "Law enforcement-sensitive information" },
  { id: "LEGAL", label: "Legal", description: "Attorney-client privilege, litigation-sensitive" },
  { id: "FINANCIAL", label: "Financial", description: "Proprietary financial or budget information" },
  { id: "NUCLEAR", label: "Nuclear", description: "Nuclear materials, safeguards, and waste" },
  { id: "TRANSPORT", label: "Transportation", description: "Sensitive transportation security information" },
  { id: "HEALTH", label: "Health Information", description: "Health records and medical information (non-HIPAA)" },
  { id: "RESEARCH", label: "Research", description: "Federally-funded R&D and research data" },
  { id: "CONTRACTS", label: "Contract Information", description: "Contract terms, pricing, and deliverable details" },
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

// Common NIST SP 800-171 controls often inherited from cloud/SaaS providers
const COMMON_INHERITED_CONTROLS = [
  "3.1.1", "3.1.2", "3.3.1", "3.3.2", "3.4.1", "3.4.2",
  "3.5.3", "3.13.1", "3.13.2", "3.13.5", "3.13.8", "3.14.1",
];

// ─── Types ───────────────────────────────────────────────────────────────────
interface ExternalProvider {
  id: string; // client-side key
  name: string;
  serviceType: string;
  dataTypes: string[];
  inheritedControls: string[];
  website?: string;
}

interface ScopeData {
  systemName: string;
  systemDescription: string;
  authorizationBoundaryStatement: string;
  systemOwnerName: string;
  systemOwnerEmail: string;
  issoName: string;
  issoEmail: string;
  cuiCategories: string[];
  externalServiceProviders: ExternalProvider[];
  boundaryNarrative: string;
}

// ─── Step definitions ────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, title: "System Identification", icon: FileText, shortTitle: "System" },
  { id: 2, title: "CUI Categories", icon: Shield, shortTitle: "CUI" },
  { id: 3, title: "Asset Scope", icon: Server, shortTitle: "Assets" },
  { id: 4, title: "External Providers", icon: Globe, shortTitle: "Providers" },
  { id: 5, title: "Network Narrative", icon: Network, shortTitle: "Network" },
  { id: 6, title: "System Personnel", icon: Users, shortTitle: "Personnel" },
] as const;

// ─── Sub-components ──────────────────────────────────────────────────────────
function StepIndicator({
  steps,
  currentStep,
  completedSteps,
}: {
  steps: typeof STEPS;
  currentStep: number;
  completedSteps: Set<number>;
}) {
  return (
    <nav aria-label="Wizard progress" className="mb-8">
      <ol className="flex items-center gap-0">
        {steps.map((step, idx) => {
          const isCompleted = completedSteps.has(step.id);
          const isCurrent = step.id === currentStep;
          const isLast = idx === steps.length - 1;
          return (
            <li key={step.id} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                    isCompleted
                      ? "bg-[var(--color-status-green)] text-white"
                      : isCurrent
                      ? "bg-[var(--color-navy-primary)] text-white ring-4 ring-[var(--color-navy-primary)]/10"
                      : "border-2 border-[var(--color-border)] bg-white text-[var(--color-gray-500)]"
                  }`}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : step.id}
                </div>
                <span
                  className={`hidden text-[11px] font-medium sm:block ${
                    isCurrent ? "text-[var(--color-navy-primary)]" : "text-[var(--color-gray-500)]"
                  }`}
                >
                  {step.shortTitle}
                </span>
              </div>
              {!isLast && (
                <div
                  className={`mx-1 h-0.5 flex-1 transition-colors ${
                    isCompleted ? "bg-[var(--color-status-green)]" : "bg-[var(--color-border)]"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function GuidanceNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" aria-hidden />
      <p>{children}</p>
    </div>
  );
}

const fieldClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2.5 text-sm text-[var(--color-gray-900)] placeholder:text-[var(--color-gray-500)] focus:border-[var(--color-navy-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-navy-primary)]/10 transition-colors";
const labelClass = "mb-1.5 block text-[13px] font-medium text-[var(--color-gray-700)]";
const sectionHeadingClass = "text-base font-semibold text-[var(--color-gray-900)]";

// ─── Step 1: System Identification ───────────────────────────────────────────
function Step1SystemId({
  data,
  onChange,
}: {
  data: ScopeData;
  onChange: (patch: Partial<ScopeData>) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className={sectionHeadingClass}>System Identification</h2>
        <p className="mt-1 text-sm text-[var(--color-gray-600)]">
          Formally identify the information system subject to this CMMC assessment. This information will appear in your System Security Plan.
        </p>
      </div>
      <GuidanceNote>
        The "System Name" is the official designation used in your contract and government documentation — it may differ from your company name. The authorization boundary statement is the most important field: it defines exactly which components process, store, or transmit CUI.
      </GuidanceNote>
      <div>
        <label className={labelClass}>
          System Name <span className="text-[var(--color-status-red)]">*</span>
        </label>
        <input
          type="text"
          value={data.systemName}
          onChange={(e) => onChange({ systemName: e.target.value })}
          placeholder="e.g., Acme Defense Manufacturing Information System (ADMIS)"
          className={fieldClass}
        />
        <p className="mt-1 text-xs text-[var(--color-gray-500)]">
          The formal name of the system as referenced in contracts and DoD documentation.
        </p>
      </div>
      <div>
        <label className={labelClass}>System Description</label>
        <textarea
          rows={4}
          value={data.systemDescription}
          onChange={(e) => onChange({ systemDescription: e.target.value })}
          placeholder="Describe the purpose of this information system, the mission it supports, and the type of work performed by its users."
          className={fieldClass}
        />
        <p className="mt-1 text-xs text-[var(--color-gray-500)]">
          2–4 sentences describing what the system does, who uses it, and the contracts it supports.
        </p>
      </div>
      <div>
        <label className={labelClass}>
          Authorization Boundary Statement <span className="text-[var(--color-status-red)]">*</span>
        </label>
        <textarea
          rows={6}
          value={data.authorizationBoundaryStatement}
          onChange={(e) => onChange({ authorizationBoundaryStatement: e.target.value })}
          placeholder={`The authorization boundary for [System Name] encompasses all hardware, software, and services that process, store, or transmit Controlled Unclassified Information (CUI) in support of [Contract/Program]. The boundary includes [list key components: workstations, servers, cloud services]. The boundary does not include [list exclusions: personal devices, HR systems, guest WiFi].`}
          className={fieldClass}
        />
        <p className="mt-1 text-xs text-[var(--color-gray-500)]">
          This statement should explicitly name what IS in scope and what is NOT. Be specific about hardware, software, and network segments.
        </p>
      </div>
    </div>
  );
}

// ─── Step 2: CUI Categories ───────────────────────────────────────────────────
function Step2CuiCategories({
  data,
  onChange,
}: {
  data: ScopeData;
  onChange: (patch: Partial<ScopeData>) => void;
}) {
  const toggle = (id: string) => {
    const current = data.cuiCategories;
    if (current.includes(id)) {
      onChange({ cuiCategories: current.filter((c) => c !== id) });
    } else {
      onChange({ cuiCategories: [...current, id] });
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className={sectionHeadingClass}>CUI Categories in Scope</h2>
        <p className="mt-1 text-sm text-[var(--color-gray-600)]">
          Select all CUI categories that your organization handles within this system boundary. These drive which NIST SP 800-171 controls are highest priority.
        </p>
      </div>
      <GuidanceNote>
        Most DIB contractors primarily handle Controlled Technical Information (CTI). If you have DoD contracts involving weapons systems, research data, or technical specifications, CTI is almost certainly in scope.
      </GuidanceNote>
      <div className="space-y-2">
        {CUI_CATEGORIES.map((cat) => {
          const isSelected = data.cuiCategories.includes(cat.id);
          return (
            <label
              key={cat.id}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                isSelected
                  ? "border-[var(--color-navy-primary)] bg-[var(--color-navy-primary)]/5"
                  : "border-[var(--color-border)] bg-white hover:border-[var(--color-gray-200)] hover:bg-[var(--color-gray-50)]"
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggle(cat.id)}
                className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-navy-primary)]"
              />
              <div>
                <p className={`text-sm font-medium ${isSelected ? "text-[var(--color-navy-primary)]" : "text-[var(--color-gray-900)]"}`}>
                  {cat.label}
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-gray-500)]">{cat.description}</p>
              </div>
            </label>
          );
        })}
      </div>
      {data.cuiCategories.length === 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
          <p>At least one CUI category must be selected. If you process defense contracts, select Controlled Technical Information (CTI).</p>
        </div>
      )}
    </div>
  );
}

// ─── Step 3: Asset Scope ──────────────────────────────────────────────────────
function Step3AssetScope({
  data,
  onChange,
}: {
  data: ScopeData;
  onChange: (patch: Partial<ScopeData>) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className={sectionHeadingClass}>Asset Scope</h2>
        <p className="mt-1 text-sm text-[var(--color-gray-600)]">
          Describe the types of assets within your CUI boundary. Detailed endpoint records are managed in the System Boundary section — this step captures the high-level inventory for your SSP narrative.
        </p>
      </div>
      <GuidanceNote>
        Assessors check that your asset scope is consistent with your authorization boundary statement and that no CUI-touching systems have been excluded. List by category, not individual hosts.
      </GuidanceNote>
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          {
            label: "Hardware (Endpoints)",
            placeholder: "e.g., 12 Windows workstations (Dell OptiPlex), 3 Windows Server 2025 VMs in Azure Government",
            field: "assetHardware" as const,
          },
          {
            label: "Software Applications",
            placeholder: "e.g., Microsoft 365 GCC High, SharePoint, CAD/CAM tools (SolidWorks), ERP (Deltek Costpoint)",
            field: "assetSoftware" as const,
          },
          {
            label: "Cloud Services",
            placeholder: "e.g., Azure Government (compute, storage, Entra ID), Microsoft 365 GCC High",
            field: "assetCloud" as const,
          },
          {
            label: "Network & Connectivity",
            placeholder: "e.g., On-premises LAN, site-to-site VPN to Azure Government, no internet-direct CUI access",
            field: "assetNetwork" as const,
          },
        ].map(({ label, placeholder, field }) => (
          <div key={field}>
            <label className={labelClass}>{label}</label>
            <textarea
              rows={3}
              value={(data as unknown as Record<string, string>)[field] ?? ""}
              onChange={(e) =>
                onChange({ [field]: e.target.value } as unknown as Partial<ScopeData>)
              }
              placeholder={placeholder}
              className={fieldClass}
            />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-gray-50)] p-4">
        <p className="text-sm font-medium text-[var(--color-gray-700)]">Detailed endpoint inventory</p>
        <p className="mt-1 text-xs text-[var(--color-gray-500)]">
          Individual servers and workstations are managed under System Boundary → Manage Endpoints, where you assign OS baselines and upload technical evidence. This step captures the SSP-level narrative summary.
        </p>
      </div>
    </div>
  );
}

// ─── Step 4: External Providers ───────────────────────────────────────────────
function Step4ExternalProviders({
  data,
  onChange,
}: {
  data: ScopeData;
  onChange: (patch: Partial<ScopeData>) => void;
}) {
  const [controlInput, setControlInput] = useState<Record<string, string>>({});

  const addProvider = () => {
    const newProvider: ExternalProvider = {
      id: crypto.randomUUID(),
      name: "",
      serviceType: "",
      dataTypes: [],
      inheritedControls: [],
      website: "",
    };
    onChange({ externalServiceProviders: [...data.externalServiceProviders, newProvider] });
  };

  const updateProvider = (id: string, patch: Partial<ExternalProvider>) => {
    onChange({
      externalServiceProviders: data.externalServiceProviders.map((p) =>
        p.id === id ? { ...p, ...patch } : p
      ),
    });
  };

  const removeProvider = (id: string) => {
    onChange({
      externalServiceProviders: data.externalServiceProviders.filter((p) => p.id !== id),
    });
  };

  const toggleControl = (providerId: string, controlId: string) => {
    const provider = data.externalServiceProviders.find((p) => p.id === providerId);
    if (!provider) return;
    const current = provider.inheritedControls;
    const updated = current.includes(controlId)
      ? current.filter((c) => c !== controlId)
      : [...current, controlId];
    updateProvider(providerId, { inheritedControls: updated });
  };

  const addCustomControl = (providerId: string) => {
    const val = (controlInput[providerId] ?? "").trim();
    if (!val) return;
    const provider = data.externalServiceProviders.find((p) => p.id === providerId);
    if (!provider || provider.inheritedControls.includes(val)) return;
    updateProvider(providerId, { inheritedControls: [...provider.inheritedControls, val] });
    setControlInput((prev) => ({ ...prev, [providerId]: "" }));
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className={sectionHeadingClass}>External Service Providers</h2>
        <p className="mt-1 text-sm text-[var(--color-gray-600)]">
          List all external organizations that provide services to your CUI system. For each, identify which NIST SP 800-171 controls they satisfy on your behalf (inherited controls).
        </p>
      </div>
      <GuidanceNote>
        Cloud service providers (e.g., Azure Government, Microsoft 365 GCC High) with FedRAMP High or DoD IL4/IL5 authorizations often provide inheritance for physical protection, media protection, and some access control requirements. Document each relationship so assessors can verify the inheritance chain.
      </GuidanceNote>

      {data.externalServiceProviders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center">
          <Globe className="mx-auto h-8 w-8 text-[var(--color-gray-500)]" />
          <p className="mt-3 text-sm font-medium text-[var(--color-gray-700)]">No external providers added</p>
          <p className="mt-1 text-xs text-[var(--color-gray-500)]">
            If your system uses any cloud services, managed IT, or third-party SaaS in the CUI boundary, add them here.
          </p>
          <button
            type="button"
            onClick={addProvider}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-gray-700)] transition-colors hover:bg-[var(--color-gray-50)]"
          >
            <Plus className="h-4 w-4" /> Add first provider
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {data.externalServiceProviders.map((provider) => (
            <div
              key={provider.id}
              className="rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-[var(--color-gray-900)]">
                  {provider.name || "Unnamed provider"}
                </p>
                <button
                  type="button"
                  onClick={() => removeProvider(provider.id)}
                  className="shrink-0 rounded-md p-1 text-[var(--color-gray-500)] transition-colors hover:bg-[var(--color-gray-100)] hover:text-[var(--color-status-red)]"
                  aria-label="Remove provider"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Provider Name</label>
                  <input
                    type="text"
                    value={provider.name}
                    onChange={(e) => updateProvider(provider.id, { name: e.target.value })}
                    placeholder="Microsoft Corporation"
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Service Type</label>
                  <select
                    value={provider.serviceType}
                    onChange={(e) => updateProvider(provider.id, { serviceType: e.target.value })}
                    className={fieldClass}
                  >
                    <option value="">Select…</option>
                    {SERVICE_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Website / Documentation URL</label>
                  <input
                    type="url"
                    value={provider.website}
                    onChange={(e) => updateProvider(provider.id, { website: e.target.value })}
                    placeholder="https://..."
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>CUI Data Types Handled</label>
                  <input
                    type="text"
                    value={provider.dataTypes.join(", ")}
                    onChange={(e) =>
                      updateProvider(provider.id, {
                        dataTypes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                      })
                    }
                    placeholder="CTI, technical drawings, email"
                    className={fieldClass}
                  />
                  <p className="mt-1 text-xs text-[var(--color-gray-500)]">Comma-separated</p>
                </div>
              </div>

              <div className="mt-4">
                <p className={labelClass}>Inherited Controls</p>
                <p className="mb-2 text-xs text-[var(--color-gray-500)]">
                  Controls this provider satisfies on your behalf (check common ones, add custom IDs as needed).
                </p>
                <div className="flex flex-wrap gap-2">
                  {COMMON_INHERITED_CONTROLS.map((ctrl) => {
                    const selected = provider.inheritedControls.includes(ctrl);
                    return (
                      <button
                        key={ctrl}
                        type="button"
                        onClick={() => toggleControl(provider.id, ctrl)}
                        className={`rounded-md px-2.5 py-1 text-xs font-mono font-medium transition-colors ${
                          selected
                            ? "bg-[var(--color-navy-primary)] text-white"
                            : "border border-[var(--color-border)] bg-white text-[var(--color-gray-600)] hover:border-[var(--color-gray-200)] hover:bg-[var(--color-gray-50)]"
                        }`}
                      >
                        {ctrl}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={controlInput[provider.id] ?? ""}
                    onChange={(e) =>
                      setControlInput((prev) => ({ ...prev, [provider.id]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomControl(provider.id);
                      }
                    }}
                    placeholder="3.X.X"
                    className="flex-1 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-mono text-[var(--color-gray-900)] placeholder:text-[var(--color-gray-500)] focus:outline-none focus:ring-1 focus:ring-[var(--color-navy-primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => addCustomControl(provider.id)}
                    className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
                  >
                    Add
                  </button>
                </div>
                {provider.inheritedControls.filter((c) => !COMMON_INHERITED_CONTROLS.includes(c)).map(
                  (ctrl) => (
                    <span
                      key={ctrl}
                      className="mt-1 mr-1 inline-flex items-center gap-1 rounded-md bg-[var(--color-navy-primary)] px-2 py-0.5 text-xs font-mono text-white"
                    >
                      {ctrl}
                      <button
                        type="button"
                        onClick={() => toggleControl(provider.id, ctrl)}
                        className="ml-0.5 opacity-70 hover:opacity-100"
                        aria-label={`Remove ${ctrl}`}
                      >
                        ×
                      </button>
                    </span>
                  )
                )}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addProvider}
            className="inline-flex items-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-gray-600)] transition-colors hover:border-[var(--color-gray-200)] hover:bg-[var(--color-gray-50)]"
          >
            <Plus className="h-4 w-4" /> Add provider
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Step 5: Network Narrative ────────────────────────────────────────────────
function Step5NetworkNarrative({
  data,
  onChange,
}: {
  data: ScopeData;
  onChange: (patch: Partial<ScopeData>) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className={sectionHeadingClass}>Network & Boundary Narrative</h2>
        <p className="mt-1 text-sm text-[var(--color-gray-600)]">
          Describe your network architecture and how CUI flows through the boundary. This narrative supplements the technical network diagram in your SSP.
        </p>
      </div>
      <GuidanceNote>
        Assessors use this narrative to understand where CUI enters and exits the boundary. Describe the connection between your on-premises environment and any cloud services. Note any data flows to external parties, how remote workers connect, and what prevents CUI from leaving the boundary.
      </GuidanceNote>
      <div>
        <label className={labelClass}>Network Architecture Description</label>
        <textarea
          rows={8}
          value={data.boundaryNarrative}
          onChange={(e) => onChange({ boundaryNarrative: e.target.value })}
          className={fieldClass}
          placeholder={`Describe your network:

1. Physical layout: On-premises / remote / hybrid. Data centers, office locations.
2. Cloud connectivity: VPN tunnels, ExpressRoute, or direct connections to cloud.
3. CUI data flows: How CUI enters (contract delivery, downloads from DoDI portals), where it's stored (specific shares, SharePoint), and how it's transmitted (encrypted email, SFTP).
4. Boundary enforcement: Firewalls, network segmentation, access control points that enforce the boundary.
5. Remote access: How employees working remotely access CUI-in-scope systems (VPN, VDI, etc.).
6. External connections: Any authorized external connections (e.g., government portals, prime contractor systems).`}
        />
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-gray-50)] p-4">
        <p className="text-sm font-medium text-[var(--color-gray-700)]">Boundary Diagram</p>
        <p className="mt-1 text-xs text-[var(--color-gray-500)]">
          A formal network diagram is generated automatically from your asset inventory under System Boundary → Diagram View. The narrative here provides the interpretive context that the diagram cannot.
        </p>
      </div>
    </div>
  );
}

// ─── Step 6: System Personnel ─────────────────────────────────────────────────
function Step6Personnel({
  data,
  onChange,
}: {
  data: ScopeData;
  onChange: (patch: Partial<ScopeData>) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className={sectionHeadingClass}>System Owner & Security Personnel</h2>
        <p className="mt-1 text-sm text-[var(--color-gray-600)]">
          Designate the key personnel responsible for this CUI system. These roles are required fields in the System Security Plan.
        </p>
      </div>
      <GuidanceNote>
        The System Owner is the executive or senior manager responsible for the overall procurement and operation of the information system. The ISSO (Information System Security Officer) is responsible for the day-to-day security posture and compliance tracking.
      </GuidanceNote>

      <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
        <p className="text-sm font-semibold text-[var(--color-gray-800)]">System Owner</p>
        <p className="mt-0.5 text-xs text-[var(--color-gray-500)]">
          Senior manager accountable for system operations and security decisions.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Full Name</label>
            <input
              type="text"
              value={data.systemOwnerName}
              onChange={(e) => onChange({ systemOwnerName: e.target.value })}
              placeholder="Jane Smith"
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>Work Email</label>
            <input
              type="email"
              value={data.systemOwnerEmail}
              onChange={(e) => onChange({ systemOwnerEmail: e.target.value })}
              placeholder="jsmith@contractor.com"
              className={fieldClass}
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
        <p className="text-sm font-semibold text-[var(--color-gray-800)]">
          Information System Security Officer (ISSO)
        </p>
        <p className="mt-0.5 text-xs text-[var(--color-gray-500)]">
          Individual responsible for daily security operations, POA&M management, and assessor coordination.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Full Name</label>
            <input
              type="text"
              value={data.issoName}
              onChange={(e) => onChange({ issoName: e.target.value })}
              placeholder="John Doe"
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>Work Email</label>
            <input
              type="email"
              value={data.issoEmail}
              onChange={(e) => onChange({ issoEmail: e.target.value })}
              placeholder="jdoe@contractor.com"
              className={fieldClass}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Review Panel ─────────────────────────────────────────────────────────────
function ReviewPanel({ data }: { data: ScopeData }) {
  const cuiLabels = CUI_CATEGORIES.filter((c) => data.cuiCategories.includes(c.id)).map(
    (c) => c.label
  );

  const generatedStatement =
    data.authorizationBoundaryStatement ||
    `The authorization boundary for ${data.systemName || "[System Name]"} encompasses all hardware, software, and services that process, store, or transmit Controlled Unclassified Information (CUI)${cuiLabels.length > 0 ? ` — specifically ${cuiLabels.slice(0, 2).join(" and ")}` : ""} — in support of the organization's defense contract obligations. ${data.systemOwnerName ? `The designated System Owner is ${data.systemOwnerName}.` : ""} ${data.issoName ? `The Information System Security Officer is ${data.issoName}.` : ""}`;

  return (
    <div className="space-y-5">
      <div>
        <h2 className={sectionHeadingClass}>Review Boundary Scope</h2>
        <p className="mt-1 text-sm text-[var(--color-gray-600)]">
          Confirm the information below before saving. This will be used to generate your SSP boundary section.
        </p>
      </div>

      {/* Generated statement preview */}
      <div className="rounded-xl border border-[var(--color-navy-primary)]/20 bg-[var(--color-navy-primary)]/5 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-navy-primary)]">
          Authorization Boundary Statement (Preview)
        </p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-gray-800)]">
          {generatedStatement}
        </p>
      </div>

      {/* Summary grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-[var(--color-border)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-gray-500)]">System</p>
          <p className="mt-2 text-sm font-medium text-[var(--color-gray-900)]">
            {data.systemName || <span className="text-[var(--color-gray-400)] italic">Not set</span>}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--color-border)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-gray-500)]">Personnel</p>
          <div className="mt-2 space-y-1 text-sm text-[var(--color-gray-700)]">
            <p>SO: {data.systemOwnerName || <span className="text-[var(--color-gray-400)] italic">Not set</span>}</p>
            <p>ISSO: {data.issoName || <span className="text-[var(--color-gray-400)] italic">Not set</span>}</p>
          </div>
        </div>
        <div className="rounded-lg border border-[var(--color-border)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-gray-500)]">CUI Categories</p>
          {cuiLabels.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {cuiLabels.map((l) => (
                <li key={l} className="flex items-center gap-1.5 text-xs text-[var(--color-gray-700)]">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-status-green)]" />
                  {l}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-[var(--color-gray-400)] italic">None selected</p>
          )}
        </div>
        <div className="rounded-lg border border-[var(--color-border)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-gray-500)]">External Providers</p>
          {data.externalServiceProviders.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {data.externalServiceProviders.map((p) => (
                <li key={p.id} className="text-xs text-[var(--color-gray-700)]">
                  {p.name || "Unnamed"} — {p.inheritedControls.length} inherited controls
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-[var(--color-gray-400)] italic">None added</p>
          )}
        </div>
      </div>
    </div>
  );
}

type InitialProvider = Omit<ExternalProvider, "id"> & { id?: string };
type InitialData = Omit<Partial<ScopeData>, "externalServiceProviders"> & {
  externalServiceProviders?: InitialProvider[];
};

// ─── Main Wizard ──────────────────────────────────────────────────────────────
export function BoundaryScopingWizard({
  initialData,
  onComplete,
}: {
  initialData?: InitialData;
  onComplete?: () => void;
}) {
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ updated: number; skipped: number; providers: string[] } | null>(null);

  const [data, setData] = useState<ScopeData>({
    systemName: initialData?.systemName ?? "",
    systemDescription: initialData?.systemDescription ?? "",
    authorizationBoundaryStatement: initialData?.authorizationBoundaryStatement ?? "",
    systemOwnerName: initialData?.systemOwnerName ?? "",
    systemOwnerEmail: initialData?.systemOwnerEmail ?? "",
    issoName: initialData?.issoName ?? "",
    issoEmail: initialData?.issoEmail ?? "",
    cuiCategories: initialData?.cuiCategories ?? [],
    externalServiceProviders:
      (initialData?.externalServiceProviders ?? []).map((p) => ({
        ...p,
        id: p.id ?? crypto.randomUUID(),
      })),
    boundaryNarrative: initialData?.boundaryNarrative ?? "",
  });

  const handleChange = useCallback((patch: Partial<ScopeData>) => {
    setData((prev) => ({ ...prev, ...patch }));
  }, []);

  // Auto-save on step advance
  const saveToServer = useCallback(
    async (patch: Partial<typeof data> & { markComplete?: boolean }) => {
      setSaveError(null);
      setSaving(true);
      try {
        const res = await fetch("/api/boundary/scope", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...data, ...patch }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setSaveError(err.error ?? "Failed to save. Please try again.");
        }
      } catch {
        setSaveError("Network error. Please check your connection.");
      } finally {
        setSaving(false);
      }
    },
    [data]
  );

  const goNext = async () => {
    await saveToServer({});
    setCompletedSteps((prev) => new Set([...prev, currentStep]));
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    } else {
      setShowReview(true);
    }
  };

  const goBack = () => {
    if (showReview) {
      setShowReview(false);
      return;
    }
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleFinish = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/boundary/scope", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, markComplete: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaveError(err.error ?? "Failed to save. Please try again.");
        return;
      }
      const result = await res.json().catch(() => ({}));
      if (result?.syncResult) {
        setSyncResult(result.syncResult);
      }
      onComplete?.();
    } catch {
      setSaveError("Network error. Please check your connection.");
    } finally {
      setSaving(false);
    }
  };

  const handleManualSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/boundary/sync-inherited-controls", { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        setSyncResult(result);
      }
    } finally {
      setSyncing(false);
    }
  };

  const canProceed = () => {
    if (showReview) return true;
    switch (currentStep) {
      case 1:
        return data.systemName.trim().length > 0;
      case 2:
        return data.cuiCategories.length > 0;
      default:
        return true;
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      {!showReview ? (
        <>
          <StepIndicator
            steps={STEPS}
            currentStep={currentStep}
            completedSteps={completedSteps}
          />

          <div className="rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-sm sm:p-8">
            {currentStep === 1 && <Step1SystemId data={data} onChange={handleChange} />}
            {currentStep === 2 && <Step2CuiCategories data={data} onChange={handleChange} />}
            {currentStep === 3 && <Step3AssetScope data={data} onChange={handleChange} />}
            {currentStep === 4 && (
              <Step4ExternalProviders data={data} onChange={handleChange} />
            )}
            {currentStep === 5 && (
              <Step5NetworkNarrative data={data} onChange={handleChange} />
            )}
            {currentStep === 6 && <Step6Personnel data={data} onChange={handleChange} />}
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-sm sm:p-8 space-y-6">
          <ReviewPanel data={data} />

          {/* Inherited controls sync — only shown when providers exist */}
          {data.externalServiceProviders.length > 0 && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-gray-50)]/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-gray-800)]">
                    Inherited control auto-wire
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-gray-500)]">
                    Automatically marks controls listed under your external providers as{" "}
                    <span className="font-medium text-slate-700">Inherited</span>{" "}
                    — only updates controls that are currently <em>Not Started</em>.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={syncing}
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)] disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "Syncing…" : "Re-sync inherited controls"}
                </button>
              </div>

              {syncResult && (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  <span className="font-semibold">Sync complete.</span>{" "}
                  {syncResult.updated} control{syncResult.updated !== 1 ? "s" : ""} marked inherited,{" "}
                  {syncResult.skipped} already-adjudicated control{syncResult.skipped !== 1 ? "s" : ""} preserved
                  {syncResult.providers.length > 0 && (
                    <> · Providers: {syncResult.providers.join(", ")}</>
                  )}.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {saveError && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          {saveError}
        </div>
      )}

      {/* Navigation */}
      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={goBack}
          disabled={currentStep === 1 && !showReview}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--color-gray-700)] transition-colors hover:bg-[var(--color-gray-50)] disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>

        <div className="flex items-center gap-3">
          {saving && (
            <span className="flex items-center gap-1.5 text-xs text-[var(--color-gray-500)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving…
            </span>
          )}
          {showReview ? (
            <button
              type="button"
              onClick={handleFinish}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-status-green)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-600 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              {saving ? "Saving…" : "Complete Boundary Scoping"}
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              disabled={!canProceed() || saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-navy-primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-40"
            >
              {currentStep === STEPS.length ? "Review" : "Continue"}
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
