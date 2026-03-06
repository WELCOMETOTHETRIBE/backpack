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

/** Grouped scope options for UI (create/edit boundary, scope modals). Safe to import from server or client. */
export const SCOPE_OPTIONS: { label: string; items: { value: ScopeComponent; label: string }[] }[] = [
  { label: "Compute", items: [{ value: "windows_server_vm", label: "Windows Server VM(s)" }, { value: "linux_server_vm", label: "Linux Server VM(s)" }, { value: "virtual_desktop", label: "Virtual Desktop / VDI" }] },
  { label: "Cloud Hosting", items: [{ value: "azure_cloud", label: "Azure Cloud" }] },
  { label: "Identity & Access", items: [{ value: "identity_provider", label: "Identity Provider (Entra / AD)" }, { value: "privileged_access_management", label: "Privileged Access Management" }] },
  { label: "Administrative Access", items: [{ value: "remote_access_bastion", label: "Bastion / Jump Host" }, { value: "vpn_gateway", label: "VPN Gateway" }, { value: "admin_workstations", label: "Privileged Access Workstations" }] },
  { label: "Network Protection", items: [{ value: "network_security_grouping", label: "Network Security Groups / Firewalls" }, { value: "network_devices", label: "Routers / Switches / Network Devices" }] },
  { label: "Storage", items: [{ value: "file_storage", label: "File Storage / SMB Shares" }, { value: "object_storage", label: "Object Storage" }] },
  { label: "Crypto", items: [{ value: "key_management", label: "Key Management / HSM" }] },
  { label: "Monitoring & Detection", items: [{ value: "siem_logging", label: "Centralized Logging / SIEM" }, { value: "endpoint_detection_response", label: "Endpoint Detection & Response" }, { value: "vulnerability_management", label: "Vulnerability Scanning" }, { value: "configuration_compliance", label: "Configuration Compliance / STIG scanning" }] },
  { label: "Recovery", items: [{ value: "backup_recovery", label: "Backup / Recovery System" }] },
  { label: "Productivity", items: [{ value: "microsoft_office", label: "Microsoft Office / M365" }, { value: "collaboration_suite", label: "Collaboration Platform" }] },
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
