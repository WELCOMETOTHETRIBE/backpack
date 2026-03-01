# Azure/Entra baseline — 7 controls

This document describes the **Azure/Entra 7** NIST SP 800-171 Rev 2 controls (Trust Codex bucket) and the Azure/Entra ID configuration required to satisfy them. Use it for SSP narrative, auditor reference, and when creating a system boundary that includes Azure Cloud.

## Overview

When your CUI boundary includes **Azure Cloud** (Government or Commercial), identity and access are typically managed by **Microsoft Entra ID** (Azure AD). The following seven controls are commonly satisfied by Entra ID and Azure configuration; attestation and evidence (Conditional Access policies, sign-in logs, audit logs) support closure during assessment.

## The 7 Azure/Entra controls

| Control | Title | Azure/Entra configuration requirement |
|---------|--------|----------------------------------------|
| 3.1.14 | Control CUI flow | Route remote access through managed control points; use Azure Virtual WAN or firewall rules and Entra ID for authentication. Evidence: network configuration, Conditional Access policies. |
| 3.1.13 | Cryptographic protection for remote access | Enforce TLS for remote access (e.g. RDP over TLS, Azure Bastion); disable weak protocols. Evidence: Entra/session security settings, Schannel/crypto configuration. |
| 3.5.3 | MFA for privileged accounts | Conditional Access policy requiring MFA for privileged roles (e.g. Global Admin, privileged roles). Evidence: Entra ID Conditional Access policies and sign-in logs. |
| 3.7.5 | MFA for nonlocal maintenance | Require MFA for nonlocal maintenance sessions (e.g. Azure Portal, management plane). Evidence: Conditional Access for cloud admin access, sign-in logs. |
| 3.3.1 | Create and retain audit logs | Enable Entra ID audit logs and Azure resource diagnostic logs; retain per policy. Evidence: Entra audit log configuration, Log Analytics or storage retention. |
| 3.3.2 | Unique user traceability | Ensure audit records attribute actions to individual users (Entra user identity in logs). Evidence: Entra sign-in and audit logs with user identity. |
| 3.13.8 | Cryptographic mechanisms for CUI in transit | Use TLS for data in transit; Azure services use TLS by default. Evidence: Entra/session security, Azure TLS configuration documentation or compliance offering. |

## Evidence and C3PAO focus

- **Conditional Access**: Document policies that enforce MFA and session controls for privileged and nonlocal access.
- **Audit and sign-in logs**: Retain and make available for assessor review; ensure user identity is present.
- **TLS/remote access**: Document use of TLS for management and data-in-transit; reference Azure compliance documentation where applicable.

## Related

- **Control plane**: System boundary creation modal shows these 7 controls when “Azure Cloud” is selected; scope and Azure environment (Gov/Commercial) are stored per boundary.
- **Source of truth (app)**: `src/lib/compliance/azure-entra-controls.ts` — `AZURE_ENTRA_7_CONTROL_IDS` and `AZURE_ENTRA_BASELINE`.
