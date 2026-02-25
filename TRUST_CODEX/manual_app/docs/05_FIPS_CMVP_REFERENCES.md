## Purpose
This page captures the **CMVP certificate numbers and URLs** used to support NIST 800-171 **SC.L2-3.13.11 (FIPS-validated cryptography)** for this enclave.

In addition to showing that **FIPS mode is enabled** on the OS, assessor-defensible closeout should retain the **CMVP certificate listing** and the **non-proprietary security policy PDF(s)** for the cryptographic modules in use.

## Enclave platform
- **OS**: Windows Server 2025 Datacenter (24H2) build \(26100.x\)

## Primary Windows cryptographic modules (CNG)
Windows uses multiple validated cryptographic modules. For most enclave use-cases (TLS, hashing, key operations via CNG), the common references are:

### Cryptographic Primitives Library — CMVP Certificate **#4825**
- **CMVP certificate page**: `https://csrc.nist.gov/projects/cryptographic-module-validation-program/certificate/4825`
- **Security policy PDF**: `https://csrc.nist.gov/CSRC/media/projects/cryptographic-module-validation-program/documents/security-policies/140sp4825.pdf`

### Kernel Mode Cryptographic Primitives Library — CMVP Certificate **#4766**
- **CMVP certificate page**: `https://csrc.nist.gov/projects/cryptographic-module-validation-program/certificate/4766`
- **Security policy PDF**: `https://csrc.nist.gov/CSRC/media/projects/cryptographic-module-validation-program/documents/security-policies/140sp4766.pdf`

## How to use this in the evidence vault
Create an evidence record under your vault, for example:
- `C:\evidence\CUI-FIPS-CMVP\cmvp-4825-cryptographic-primitives-library.pdf`
- `C:\evidence\CUI-FIPS-CMVP\cmvp-4766-kernel-mode-cryptographic-primitives-library.pdf`
- `C:\evidence\CUI-FIPS-CMVP\notes.md` (optional) documenting module versions observed on the host and how FIPS mode is enforced.

Then paste those vault paths into the control’s **Evidence refs (vault paths / records)** field in the Manual.

## Important note (Windows Server 2025)
CMVP certificates list **validated modules and tested configurations**. If a specific Windows Server 2025 build is not explicitly listed on a CMVP certificate page, retain this note as part of the control closeout and treat it as:
- A **risk-based justification** until Microsoft/NIST publishes an explicit listing, or
- A **POA&M item** if your assessor requires build-specific listing.

