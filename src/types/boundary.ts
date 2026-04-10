/**
 * Canonical scope components for system boundaries (capability categories, not vendor products).
 * Single source of truth for API validation and UI.
 */
const SCOPE_COMPONENT_VALUES = [
  "microsoft_office",
  "collaboration_suite",
  "windows_server_vm",
  "linux_server_vm",
  "virtual_desktop",
  "azure_cloud",
  "identity_provider",
  "privileged_access_management",
  "remote_access_bastion",
  "vpn_gateway",
  "admin_workstations",
  "network_security_grouping",
  "network_devices",
  "file_storage",
  "object_storage",
  "key_management",
  "siem_logging",
  "endpoint_detection_response",
  "vulnerability_management",
  "configuration_compliance",
  "backup_recovery",
] as const;

export type ScopeComponent = (typeof SCOPE_COMPONENT_VALUES)[number];
export { SCOPE_COMPONENT_VALUES };

/**
 * Grouped scope options for UI (create/edit boundary, scope modals).
 * Ordered to match DIB CMMC adjudication priority: compute → cloud → identity → access → network → data → monitoring → recovery → productivity.
 * Safe to import from server or client.
 */
export const SCOPE_OPTIONS: { label: string; description: string; items: { value: ScopeComponent; label: string; cmmc_families?: string[] }[] }[] = [
  {
    label: "Compute — CUI Workloads",
    description: "Servers and VMs that process, store, or transmit CUI",
    items: [
      { value: "windows_server_vm", label: "Windows Server VM(s)", cmmc_families: ["AC", "AU", "CM", "IA", "SC", "SI"] },
      { value: "linux_server_vm", label: "Linux Server VM(s)", cmmc_families: ["AC", "AU", "CM", "IA", "SC", "SI"] },
      { value: "virtual_desktop", label: "Virtual Desktop / VDI (CUI users)", cmmc_families: ["AC", "IA", "SC"] },
      { value: "admin_workstations", label: "Privileged Access Workstations (PAW)", cmmc_families: ["AC", "IA"] },
    ],
  },
  {
    label: "Cloud Hosting",
    description: "Cloud platform hosting CUI workloads",
    items: [
      { value: "azure_cloud", label: "Microsoft Azure (Government or Commercial)", cmmc_families: ["SC", "AC"] },
    ],
  },
  {
    label: "Identity & Authentication",
    description: "Who can access the enclave and how they prove their identity (NIST 800-171 IA family)",
    items: [
      { value: "identity_provider", label: "Identity Provider — Entra ID / Active Directory", cmmc_families: ["IA", "AC"] },
      { value: "privileged_access_management", label: "Privileged Access Management (PAM / PIM)", cmmc_families: ["AC", "IA"] },
    ],
  },
  {
    label: "Remote & Administrative Access",
    description: "How admins and remote users reach CUI systems (AC.3.012, IA.3.083)",
    items: [
      { value: "remote_access_bastion", label: "Bastion / Jump Host (no public RDP/SSH)", cmmc_families: ["AC", "SC"] },
      { value: "vpn_gateway", label: "VPN Gateway (remote CUI user access)", cmmc_families: ["AC", "SC"] },
    ],
  },
  {
    label: "Network Protection",
    description: "Boundary enforcement and traffic controls between CUI systems and untrusted networks (SC family)",
    items: [
      { value: "network_security_grouping", label: "Firewalls / Network Security Groups (NSGs)", cmmc_families: ["SC"] },
      { value: "network_devices", label: "Routers / Switches / Physical Network Devices", cmmc_families: ["SC"] },
    ],
  },
  {
    label: "Data Storage & Crypto",
    description: "Where CUI at rest lives and how it is encrypted (SC.3.177, MP family)",
    items: [
      { value: "file_storage", label: "File Storage / SMB Shares (CUI data)", cmmc_families: ["MP", "SC"] },
      { value: "object_storage", label: "Object / Blob Storage (CUI data)", cmmc_families: ["MP", "SC"] },
      { value: "key_management", label: "Key Management / HSM (encryption key escrow)", cmmc_families: ["SC"] },
    ],
  },
  {
    label: "Monitoring & Threat Detection",
    description: "Audit logging, SIEM, EDR, and configuration scanning required by AU, IR, and SI families",
    items: [
      { value: "siem_logging", label: "Centralized Logging / SIEM (AU.2.041, AU.2.042)", cmmc_families: ["AU", "IR"] },
      { value: "endpoint_detection_response", label: "Endpoint Detection & Response (EDR / MDE)", cmmc_families: ["SI", "IR"] },
      { value: "vulnerability_management", label: "Vulnerability & Patch Scanning (SI.2.214)", cmmc_families: ["SI"] },
      { value: "configuration_compliance", label: "Config Compliance / STIG Scanning (CM.2.061)", cmmc_families: ["CM"] },
    ],
  },
  {
    label: "Backup & Recovery",
    description: "Availability controls and tested recovery procedures (CP / RE family)",
    items: [
      { value: "backup_recovery", label: "Backup / Recovery System (tested restore)", cmmc_families: ["RE"] },
    ],
  },
  {
    label: "Productivity & Collaboration",
    description: "CUI-bearing productivity tools in scope for the assessment",
    items: [
      { value: "microsoft_office", label: "Microsoft 365 / Office (CUI email or files)", cmmc_families: ["AC", "SC"] },
      { value: "collaboration_suite", label: "Collaboration Platform (Teams, Slack, etc.)", cmmc_families: ["AC", "SC"] },
    ],
  },
];

const scopeLabelByValue = new Map<string, string>();
for (const group of SCOPE_OPTIONS) {
  for (const item of group.items) {
    scopeLabelByValue.set(item.value, item.label);
  }
}

export function getScopeComponentLabel(value: ScopeComponent | string): string {
  return scopeLabelByValue.get(value) ?? value;
}

export function getScopeComponentLabels(values: string[] | null): string[] {
  if (!values?.length) return [];
  return values.map((v) => scopeLabelByValue.get(v) ?? v);
}

const SCOPE_SET = new Set<string>(SCOPE_COMPONENT_VALUES);

/**
 * Validate and dedupe scope_components from request body.
 * Returns validated array or error message for 400 response.
 */
export function validateScopeComponents(raw: unknown): { ok: true; value: string[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "scope_components must be an array" };
  }
  const invalid: string[] = [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of raw) {
    if (typeof s !== "string") {
      invalid.push(String(s));
      continue;
    }
    if (!SCOPE_SET.has(s)) {
      invalid.push(s);
      continue;
    }
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  if (invalid.length > 0) {
    return { ok: false, error: `invalid scope_components: ${invalid.join(", ")}` };
  }
  return { ok: true, value: out };
}
