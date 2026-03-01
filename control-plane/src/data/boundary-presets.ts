/**
 * Named boundary presets for one-click load on /boundary.
 * Each preset is a full BoundaryInput valid against the provider catalog and gate checklist.
 */
import type { BoundaryInput } from "@/boundary-engine";

/**
 * CUI-Vault by MacTech: Windows Server 2025 Datacenter on Azure Government
 * with full C3PAO stack (Entra ID, CA/MFA, Bastion, Key Vault, Backup,
 * Azure Monitor, Sentinel, Defender for Cloud, NSGs).
 */
export const CUI_VAULT_MACTECH_PRESET: BoundaryInput = {
  hosting_model: "iaas",
  provider: "Azure",
  environment: "Government",
  os: "Windows Server 2025 Datacenter",
  services_enabled: {
    compute_vm: true,
    network_nsg: true,
    identity_entra_id: true,
    security_defender_for_cloud: true,
    logging_azure_monitor_log_analytics: true,
    logging_sentinel: true,
    crypto_azure_key_vault: true,
    backup_azure_backup: true,
    network_azure_firewall: false,
    network_expressroute: false,
    guest_windows_server: true,
    app_workload: true,
    governance_program: true,
  },
  gate_answers: {
    entra_used_for_authn: "yes",
    entra_mfa_for_privileged: "yes",
    entra_ca_policy_exists: "yes",
    defender_plan_enabled: "yes",
    defender_findings_reviewed: "yes",
    log_analytics_workspace_exists: "yes",
    diagnostic_settings_configured: "yes",
    log_retention_set: "yes",
    sentinel_workspace_configured: "yes",
    key_vault_exists: "yes",
    workload_uses_key_vault: "yes",
    kv_access_controlled: "yes",
    backup_vault_configured: "yes",
    backup_policy_applied: "yes",
    restore_tested: "yes",
    nsg_attached: "yes",
    default_deny_inbound: "yes",
  },
  assumption_confirmations: {
    assume_admin_path_bastion: "yes",
    assume_no_public_rdp: "yes",
    assume_logs_forwarded_to_monitor: "yes",
    assume_mfa_for_admin_portal: "yes",
    assume_mfa_for_bastion_access: "yes",
  },
  boundary_inclusions: [
    "PIM (Entra ID P2) recommended for accredited posture",
    "Azure Update Manager for patch orchestration and reporting",
    "Microsoft Defender for Endpoint (MDE) required",
    "BitLocker (OS/data disk encryption); recovery key escrow",
    "Microsoft Security Compliance Toolkit + DISA STIG / CIS baseline applied and evidenced",
    "Windows Advanced Audit Policy enabled per baseline",
    "Time sync (NTP/Windows Time) for consistent timestamps",
  ],
};
