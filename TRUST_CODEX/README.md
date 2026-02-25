# MacTech Solutions — CUI Pilot System Trust Codex (Authoritative)

This repository contains the **Trust Codex** for the MacTech Solutions **CUI Pilot System**.

The Trust Codex is a **book-style** manual intended to be:
- **Auditor-defensible**
- **Executive-readable**
- **Engineer-actionable**
- **Productizable** as a repeatable CUI enclave offering

## Authoritative system context (pilot defaults)

- **Compliance framework**: CMMC 2.0 Level 2  
- **Control set**: NIST SP 800-171 Rev.2 (110 requirements)
- **Cloud**: Microsoft Azure (Commercial)
- **Pilot instantiation OS**: Windows Server 2025 Datacenter
- **System type**: Contained CUI enclave / vault (contained “CUI handling environment”)

### Pilot architectural defaults

- **Enclave shape**: Windows Server 2025 enclave-only (jumpbox / VDI-style access). No application layer inside the enclave yet.
- **Identity**: Microsoft Entra ID (cloud-only) with Entra-joined VMs (no on-prem AD, no hybrid sync). Optional Privileged Identity Management (PIM) for privileged roles.
- **Admin access**: VPN + RDP to VM. No public RDP.
- **Portable media**: No removable media. USB mass storage disabled. Clipboard/drive redirection disabled. File movement only via approved, logged mechanisms.
- **Evidence retention baseline**: 1 year (product baseline).
- **Roles**: CMMC-friendly functional roles mapped internally (System Owner, ISSO, Compliance Officer, IT Administrator).
- **Incident response SLAs**: Critical ≤1 hour; High ≤4 hours; Medium/Low next business day. Escalation via on-call role + ticketing + phone for criticals.

## Control strategy (non-negotiable)

This system intentionally divides satisfaction across two classes:

- **Class A — System-Enforced / Technical controls (~90)**  
  Implemented and evidenced through OS configuration, identity, network segmentation, cryptography, logging/monitoring, and hardening baselines. Evidence must be technically verifiable and reproducible.

- **Class B — Governance / Policy / Inherited / N/A controls (~20)**  
  Satisfied by governance artifacts (policies/SOPs/training), inherited cloud responsibilities (e.g., physical security), or justified non-applicability. Governance text is **not** technical evidence.

## What this Codex is not

- Not a certification claim and not a statement of assessment readiness by itself.
- Not a claim that all 110 requirements are “technically enforced.”
- Not an SSP clone; it references SSP-style facts, but narrative comes first.

## Contents

- `BOOK.md`: reading order
- `chapters/`: the Trust Codex chapters
- `tables/`: supporting tables (explicit control mapping, evidence index)
- `schemas/`: machine-usable schemas (evidence index schema)

