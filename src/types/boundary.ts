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
