# System Purpose & Trust Model

## Purpose

The CUI Pilot System exists to provide a **contained environment** for handling CUI with clear boundaries and defensible evidence.

Pilot intent:
- Provide a controlled workspace to **access, store, and process CUI**.
- Keep scope tight to enable assessor-defensible boundary statements.
- Establish repeatable build and evidence generation patterns suitable for a product offering.

## Trust model (plain language)

We assume:
- The enclave operator (MacTech) is responsible for configuring and operating the enclave securely.
- Microsoft Azure provides inheritable protections for physical facilities and certain infrastructure services.
- Users are trusted only to the extent of their role; the system must enforce least privilege and strong authentication.

We explicitly do **not** assume:
- That governance documents alone provide technical enforcement.
- That cloud provider inheritance covers customer responsibilities (identity configuration, logging, access control, hardening).

## Pilot boundary (summary)

**In scope** (pilot defaults):
- Windows Server 2025 enclave systems (compute)
- Entra ID identity plane (authentication, conditional access, privileged role controls)
- Azure networking and VPN + RDP administrative access
- Enclave logging/monitoring and evidence storage for 1-year retention baseline

**Out of scope** (pilot defaults):
- Customer-facing application functionality
- SDLC pipelines and application vulnerability management for an enclave-hosted application (not present yet)

