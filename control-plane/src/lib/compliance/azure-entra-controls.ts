/**
 * Azure/Entra 7 controls — NIST 800-171 Rev 2 controls typically satisfied by
 * Microsoft Entra ID (Azure AD) and Azure configuration (Trust Codex: Azure/Entra bucket).
 * Used for system boundary creation (cloud baseline) and Azure/Entra baseline display.
 */

export const AZURE_ENTRA_7_CONTROL_IDS: string[] = [
  "3.1.14", // Control CUI flow; managed access control points
  "3.1.13", // Cryptographic protection for remote access
  "3.5.3",  // MFA for privileged accounts
  "3.7.5",  // MFA for nonlocal maintenance
  "3.3.1",  // Audit record creation (Entra sign-in/audit logs)
  "3.3.2",  // Unique user traceability (Entra user identity in logs)
  "3.13.8", // Cryptographic mechanisms for CUI in transit (TLS; Entra-managed)
];

export type AzureEntraBaselineEntry = {
  controlId: string;
  title: string;
  azureConfigurationRequirement: string;
};

export const AZURE_ENTRA_BASELINE: AzureEntraBaselineEntry[] = [
  {
    controlId: "3.1.14",
    title: "Control CUI flow",
    azureConfigurationRequirement:
      "Route remote access through managed control points; use Azure Virtual WAN or firewall rules and Entra ID for authentication. Evidence: network configuration, Conditional Access policies.",
  },
  {
    controlId: "3.1.13",
    title: "Cryptographic protection for remote access",
    azureConfigurationRequirement:
      "Enforce TLS for remote access (e.g. RDP over TLS, Azure Bastion); disable weak protocols. Evidence: Entra/session security settings, Schannel/crypto configuration.",
  },
  {
    controlId: "3.5.3",
    title: "MFA for privileged accounts",
    azureConfigurationRequirement:
      "Conditional Access policy requiring MFA for privileged roles (e.g. Global Admin, privileged roles). Evidence: Entra ID Conditional Access policies and sign-in logs.",
  },
  {
    controlId: "3.7.5",
    title: "MFA for nonlocal maintenance",
    azureConfigurationRequirement:
      "Require MFA for nonlocal maintenance sessions (e.g. Azure Portal, management plane). Evidence: Conditional Access for cloud admin access, sign-in logs.",
  },
  {
    controlId: "3.3.1",
    title: "Create and retain audit logs",
    azureConfigurationRequirement:
      "Enable Entra ID audit logs and Azure resource diagnostic logs; retain per policy. Evidence: Entra audit log configuration, Log Analytics or storage retention.",
  },
  {
    controlId: "3.3.2",
    title: "Unique user traceability",
    azureConfigurationRequirement:
      "Ensure audit records attribute actions to individual users (Entra user identity in logs). Evidence: Entra sign-in and audit logs with user identity.",
  },
  {
    controlId: "3.13.8",
    title: "Cryptographic mechanisms for CUI in transit",
    azureConfigurationRequirement:
      "Use TLS for data in transit; Azure services use TLS by default. Evidence: Entra/session security, Azure TLS configuration documentation or compliance offering.",
  },
];
