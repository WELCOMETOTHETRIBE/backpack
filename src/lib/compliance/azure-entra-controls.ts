/**
 * Azure/Entra controls — NIST 800-171 Rev 2 controls validated by the
 * Azure/Entra evidence collector (`TRUST_CODEX/tools/export_azure_evidence.sh`
 * + `validate_azure_entra.py` v1.4+).
 *
 * Reconciled 2026-05-01 to match the validator's 12-control coverage exactly.
 * Previous list was 7 controls but only 3 had actual technical validation;
 * the rest were aspirational claims. Honest control adjudication: every entry
 * here corresponds to a real check the validator runs against real artifacts.
 *
 * Used for: system boundary creation (cloud baseline), Azure/Entra baseline
 * display, the Outstanding Controls Wizard's "Has your Azure run gone in?"
 * hint, and the dashboard's PathTo110 widget when computing what's evidenced
 * vs claimed.
 */

export const AZURE_ENTRA_12_CONTROL_IDS: string[] = [
  "3.1.13", // Cryptographic protection for remote access
  "3.1.14", // Control CUI flow / managed access control points
  "3.3.1",  // Audit record creation (Entra sign-in / audit log)
  "3.3.2",  // Unique user traceability
  "3.5.3",  // MFA for privileged accounts
  "3.5.4",  // Replay-resistant authentication
  "3.5.5",  // Prevent identifier reuse
  "3.5.6",  // Disable identifiers after inactivity
  "3.7.5",  // MFA for nonlocal maintenance
  "3.13.5", // Implement subnetworks (NSG)
  "3.13.8", // Cryptographic mechanisms for CUI in transit
  "3.13.10", // Cryptographic key management (Azure Key Vault)
];

/**
 * Backwards-compat alias. The codebase originally had a 7-control list with
 * aspirational claims that the validator didn't fully cover. Existing call
 * sites still reference this name; pointing it at the reconciled 12 means
 * every consumer immediately gets the honest set.
 */
export const AZURE_ENTRA_7_CONTROL_IDS: string[] = AZURE_ENTRA_12_CONTROL_IDS;

export type AzureEntraBaselineEntry = {
  controlId: string;
  title: string;
  azureConfigurationRequirement: string;
  /** Validator check ID this entry corresponds to (validate_azure_entra.py). */
  validatorCheckId: string;
};

export const AZURE_ENTRA_BASELINE: AzureEntraBaselineEntry[] = [
  {
    controlId: "3.1.13",
    title: "Cryptographic protection for remote access",
    azureConfigurationRequirement:
      "Remote access via Azure Bastion (TLS-tunneled). NSG denies public RDP/SSH. Conditional Access requires compliant device. Evidence: nsg-list/rules, entra-signin or role-assignments.",
    validatorCheckId: "AZ-CRYPTO-REMOTE-ACCESS",
  },
  {
    controlId: "3.1.14",
    title: "Control CUI flow / managed access control points",
    azureConfigurationRequirement:
      "Route remote access through managed control points (Azure Bastion + Conditional Access). NSG blocks public RDP/SSH; Entra evidence shows the access path. Evidence: nsg-list/rules, entra-signin, conditional-access-policies.",
    validatorCheckId: "AC-REMOTE-ACCESS",
  },
  {
    controlId: "3.3.1",
    title: "Create and retain audit logs",
    azureConfigurationRequirement:
      "Entra ID audit logs and sign-in logs are accessible. Evidence: entra-signin.json or entra-audit-log.json (requires Audit Logs Reader role on the executing principal).",
    validatorCheckId: "AZ-AUDIT-LOG-CREATION",
  },
  {
    controlId: "3.3.2",
    title: "Unique user traceability",
    azureConfigurationRequirement:
      "Every sign-in record is attributable to a named principal (userPrincipalName / userId). Evidence: entra-signin.json with non-empty entries, each carrying a user identifier.",
    validatorCheckId: "AZ-AUDIT-USER-TRACE",
  },
  {
    controlId: "3.5.3",
    title: "MFA for privileged accounts",
    azureConfigurationRequirement:
      "Conditional Access policy requiring MFA for privileged roles. Evidence: conditional-access-policies.json + entra-signin.json + signed mfa-in-path-attested.txt/.sig.",
    validatorCheckId: "ENTRA-MFA",
  },
  {
    controlId: "3.5.4",
    title: "Replay-resistant authentication",
    azureConfigurationRequirement:
      "Entra session controls prevent token replay; CA enforces compliant device. Evidence: entra-signin (MFA in path), conditional-access-policies, role-assignments.",
    validatorCheckId: "ENTRA-REPLAY",
  },
  {
    controlId: "3.5.5",
    title: "Prevent identifier reuse",
    azureConfigurationRequirement:
      "Entra disables and recycles identifiers per policy. Evidence: entra-signin/audit log + role-assignments showing distinct UPNs over time.",
    validatorCheckId: "ENTRA-NO-REUSE",
  },
  {
    controlId: "3.5.6",
    title: "Disable identifiers after inactivity",
    azureConfigurationRequirement:
      "Inactive accounts disabled per policy (e.g. 35 days). Evidence: entra-signin, role assignments, lifecycle-workflow exports.",
    validatorCheckId: "ENTRA-INACTIVITY",
  },
  {
    controlId: "3.7.5",
    title: "MFA for nonlocal maintenance",
    azureConfigurationRequirement:
      "MFA required for cloud admin paths (Azure Portal, ARM API, PIM). Evidence: conditional-access-policies, entra-signin, signed mfa-in-path-attested.",
    validatorCheckId: "ENTRA-MFA-MA",
  },
  {
    controlId: "3.13.5",
    title: "Implement subnetworks (NSG)",
    azureConfigurationRequirement:
      "Azure NSG enforces subnetwork separation; RDP/SSH denied from public unless attested alternative (Bastion/JIT/Firewall). Evidence: nsg-list, nsg-rules-*.json.",
    validatorCheckId: "AZ-NSG",
  },
  {
    controlId: "3.13.8",
    title: "Cryptographic mechanisms for CUI in transit",
    azureConfigurationRequirement:
      "Every storage account has enableHttpsTrafficOnly=true and minimumTlsVersion=TLS1_2. Key Vault TLS via 3.13.10. Bastion TLS via 3.1.14. Evidence: storage-account-list, keyvault-list/properties.",
    validatorCheckId: "AZ-TLS-IN-TRANSIT",
  },
  {
    controlId: "3.13.10",
    title: "Cryptographic key management",
    azureConfigurationRequirement:
      "Azure Key Vault with soft delete + purge protection enabled; access via RBAC or access policies (documented). Evidence: keyvault-list, keyvault-*-properties.json, access-policies, role-assignments.",
    validatorCheckId: "AZ-KEYVAULT",
  },
];
