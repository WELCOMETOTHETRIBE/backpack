# Executive Foreword

## Why this document exists

MacTech Solutions is building a **Controlled Unclassified Information (CUI) Pilot System** that is intended to become a **repeatable, sellable enclave offering**.

This Trust Codex is written to be:
- **Executive-readable**: it explains the “why” and the trust model.
- **Auditor-defensible**: it distinguishes what is system-enforced vs governance-led, and points to evidence.
- **Engineer-actionable**: it describes mechanisms and reproducible evidence paths.

## What we are (and are not) claiming

This Codex supports the organization’s intent to meet the **CMMC 2.0 Level 2** requirements (NIST SP 800-171 Rev.2).

However:
- We do **not** claim certification.
- We do **not** claim that all 110 requirements are “technically enforced.”
- We do **not** treat policy text as technical evidence.

Instead, we present a **two-class control strategy**:
- **Class A (System-Enforced)**: technical enforcement with verifiable, reproducible evidence.
- **Class B (Governance / Inherited / Not Applicable)**: governance satisfaction, cloud inheritance, or non-applicability with explicit justification.

## System purpose (pilot defaults)

The CUI Pilot System is a **Windows Server 2025 Datacenter** contained enclave in **Microsoft Azure (Commercial)**, accessed via **VPN + RDP** to the enclave VM, using **Microsoft Entra ID** for identity. It is not customer-facing in the pilot phase.

