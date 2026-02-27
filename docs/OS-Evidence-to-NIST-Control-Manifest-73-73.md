# OS Evidence to NIST Control Mapping — 73/73 Enclave Configurations

This manifest shows how **computer OS-level evidence** produced by **Collect-Cui-Evidence-v2.ps1** maps to the **NIST SP 800-171 Rev 2 (CMMC L2)** controls we claim as **enclave configurations**.

## Count summary

| Metric | Value |
|--------|--------|
| **Enclave configuration controls claimed** | **73** |
| **Enclave configuration controls with OS evidence mapping** | **73** |
| **Claim** | **73/73** (100% of claimed enclave configurations mapped to evidence from the collector) |

## Evidence source

- **Script:** `TRUST_CODEX/vm-scripts/Collect-Cui-Evidence-v2.ps1`
- **Version:** 2.0.0
- **Bundle structure:** `host/`, `policy/`, `audit/`, `network/`, `crypto/`, `defender/`, `storage/`, `apps/`, `azure/`, `meta/`
- **Paths:** All paths in the manifest use forward slashes and match the files listed in `meta/hashes.sha256.txt` and `meta/manifest.json`.

## Machine-readable manifest

The full control-by-control mapping (including `evidence_files` arrays and `support_level`) is in:

- **`OS-Evidence-to-NIST-Control-Manifest-73-73.json`** (same directory as this file)

Use that JSON for automation, traceability matrices, and governance portal integration.

## Control list (73 controls)

| # | Control ID | NIST Req | Title | Support |
|---|------------|----------|--------|---------|
| 1 | AC.L2-3.1.1 | 3.1.1 | Limit system access to authorized users, processes, devices | STRONG |
| 2 | AC.L2-3.1.2 | 3.1.2 | Limit access to transactions/functions | STRONG |
| 3 | AC.L2-3.1.3 | 3.1.3 | Control flow of CUI | STRONG |
| 4 | AC.L2-3.1.5 | 3.1.5 | Least privilege | STRONG |
| 5 | AC.L2-3.1.6 | 3.1.6 | Non-privileged accounts | STRONG |
| 6 | AC.L2-3.1.7 | 3.1.7 | Prevent privileged function execution | STRONG |
| 7 | AC.L2-3.1.8 | 3.1.8 | Limit unsuccessful logon attempts | STRONG |
| 8 | AC.L2-3.1.9 | 3.1.9 | Privacy/security notices | STRONG |
| 9 | AC.L2-3.1.10 | 3.1.10 | Session lock | STRONG |
| 10 | AC.L2-3.1.11 | 3.1.11 | Automatic session termination | STRONG |
| 11 | AC.L2-3.1.12 | 3.1.12 | Monitor remote access | STRONG |
| 12 | AC.L2-3.1.13 | 3.1.13 | Cryptographic remote access | STRONG |
| 13 | AC.L2-3.1.21 | 3.1.21 | Limit portable storage | STRONG |
| 14 | AC.L2-3.1.22 | 3.1.22 | Control CUI on public systems | PARTIAL |
| 15 | AU.L2-3.3.1 | 3.3.1 | Create and retain audit logs | STRONG |
| 16 | AU.L2-3.3.2 | 3.3.2 | Unique user traceability | STRONG |
| 17 | AU.L2-3.3.4 | 3.3.4 | Alert on audit logging failure | STRONG |
| 18 | AU.L2-3.3.5 | 3.3.5 | Correlate audit records | PARTIAL |
| 19 | AU.L2-3.3.6 | 3.3.6 | Audit record reduction/reporting | PARTIAL |
| 20 | AU.L2-3.3.7 | 3.3.7 | System clock synchronization | STRONG |
| 21 | AU.L2-3.3.8 | 3.3.8 | Protect audit information | STRONG |
| 22 | AU.L2-3.3.9 | 3.3.9 | Limit audit logging management | STRONG |
| 23 | CM.L2-3.4.1 | 3.4.1 | Baseline configurations | STRONG |
| 24 | CM.L2-3.4.2 | 3.4.2 | Security configuration settings | STRONG |
| 25 | CM.L2-3.4.3 | 3.4.3 | Change control | PARTIAL |
| 26 | CM.L2-3.4.5 | 3.4.5 | Change access restrictions | PARTIAL |
| 27 | CM.L2-3.4.6 | 3.4.6 | Least functionality | STRONG |
| 28 | CM.L2-3.4.7 | 3.4.7 | Restrict nonessential programs | STRONG |
| 29 | CM.L2-3.4.8 | 3.4.8 | Software restriction policy | STRONG |
| 30 | CM.L2-3.4.9 | 3.4.9 | Control user-installed software | STRONG |
| 31 | IA.L2-3.5.1 | 3.5.1 | Identify users | STRONG |
| 32 | IA.L2-3.5.2 | 3.5.2 | Authenticate users | STRONG |
| 33 | IA.L2-3.5.3 | 3.5.3 | MFA for privileged accounts | PARTIAL |
| 34 | IA.L2-3.5.4 | 3.5.4 | Replay-resistant authentication | PARTIAL |
| 35 | IA.L2-3.5.5 | 3.5.5 | Prevent identifier reuse | STRONG |
| 36 | IA.L2-3.5.6 | 3.5.6 | Disable identifiers after inactivity | PARTIAL |
| 37 | IA.L2-3.5.7 | 3.5.7 | Password complexity | STRONG |
| 38 | IA.L2-3.5.8 | 3.5.8 | Prohibit password reuse | STRONG |
| 39 | IA.L2-3.5.9 | 3.5.9 | Temporary passwords | PARTIAL |
| 40 | IA.L2-3.5.10 | 3.5.10 | Cryptographically-protected passwords | PARTIAL |
| 41 | IA.L2-3.5.11 | 3.5.11 | Obscure authentication feedback | PARTIAL |
| 42 | MA.L2-3.7.1 | 3.7.1 | Perform maintenance | PARTIAL |
| 43 | MA.L2-3.7.2 | 3.7.2 | Controls on maintenance tools | PARTIAL |
| 44 | MA.L2-3.7.5 | 3.7.5 | MFA for nonlocal maintenance | PARTIAL |
| 45 | MP.L2-3.8.1 | 3.8.1 | Protect system media | PARTIAL |
| 46 | MP.L2-3.8.2 | 3.8.2 | Limit access to CUI on media | PARTIAL |
| 47 | MP.L2-3.8.5 | 3.8.5 | Control access during transport | PARTIAL |
| 48 | MP.L2-3.8.6 | 3.8.6 | Cryptographic protection on digital media | STRONG |
| 49 | MP.L2-3.8.7 | 3.8.7 | Control removable media | STRONG |
| 50 | MP.L2-3.8.8 | 3.8.8 | Prohibit portable storage without owner | PARTIAL |
| 51 | RA.L2-3.11.2 | 3.11.2 | Scan for vulnerabilities | PARTIAL |
| 52 | RA.L2-3.11.3 | 3.11.3 | Remediate vulnerabilities | PARTIAL |
| 53 | SC.L2-3.13.1 | 3.13.1 | Monitor/control/protect communications | STRONG |
| 54 | SC.L2-3.13.2 | 3.13.2 | Architectural designs | PARTIAL |
| 55 | SC.L2-3.13.3 | 3.13.3 | Separate user/system management | PARTIAL |
| 56 | SC.L2-3.13.4 | 3.13.4 | Prevent unauthorized information transfer | PARTIAL |
| 57 | SC.L2-3.13.5 | 3.13.5 | Implement subnetworks | PARTIAL |
| 58 | SC.L2-3.13.6 | 3.13.6 | Deny-by-default network communications | STRONG |
| 59 | SC.L2-3.13.8 | 3.13.8 | Cryptographic mechanisms for CUI in transit | STRONG |
| 60 | SC.L2-3.13.9 | 3.13.9 | Terminate network connections | PARTIAL |
| 61 | SC.L2-3.13.10 | 3.13.10 | Cryptographic key management | PARTIAL |
| 62 | SC.L2-3.13.11 | 3.13.11 | FIPS-validated cryptography | STRONG |
| 63 | SC.L2-3.13.12 | 3.13.12 | Collaborative computing devices | PARTIAL |
| 64 | SC.L2-3.13.13 | 3.13.13 | Control mobile code | PARTIAL |
| 65 | SC.L2-3.13.15 | 3.13.15 | Protect authenticity of communications | PARTIAL |
| 66 | SC.L2-3.13.16 | 3.13.16 | Protect CUI at rest | STRONG |
| 67 | SI.L2-3.14.1 | 3.14.1 | Identify/report/correct flaws | STRONG |
| 68 | SI.L2-3.14.2 | 3.14.2 | Malicious code protection | STRONG |
| 69 | SI.L2-3.14.3 | 3.14.3 | Monitor security alerts | PARTIAL |
| 70 | SI.L2-3.14.4 | 3.14.4 | Update malicious code protection | STRONG |
| 71 | SI.L2-3.14.5 | 3.14.5 | Periodic/real-time scans | STRONG |
| 72 | SI.L2-3.14.6 | 3.14.6 | Monitor systems and communications | STRONG |
| 73 | SI.L2-3.14.7 | 3.14.7 | Identify unauthorized use | PARTIAL |

**Support levels:**

- **STRONG:** Host evidence from the collector is usually sufficient for this control (may still require governance/SSP context).
- **PARTIAL:** Host evidence supports the control; governance, IdP, or architecture evidence may also be required for full closure.

---

## Adjudication methodology and evidence tagging

Control adjudication follows the **Trust Codex Manual** breakdown (110 NIST 800-171 Rev 2 controls). Each control is tagged by how it is closed and whether it is mapped by evidence from this manifest.

### Buckets and how users adjudicate

| Bucket | Count | Adjudication | Evidence / tagging |
|--------|--------|--------------|---------------------|
| **Enclave Configuration** | 73 | Attestation + link to evidence bundle (collector output). | **Mapped by evidence:** every control in this manifest has `evidence_files` and `support_level`. STRONG = host evidence usually sufficient; PARTIAL = host + governance/IdP/architecture often needed. |
| **Governance** | 18 | Policies, procedures, registers (document upload and attestation). | **Governance-only:** no OS evidence in the 73 manifest. These are closed by governance documents and records. |
| **Hybrid** | 17 | Both: link to OS evidence (from this manifest) **and** governance docs/registers. | **Mapped by evidence** (in 73) **and** **requires governance** (policies, registers). |

- **Enclave (73):** User uploads or links an evidence bundle; the portal can show required `evidence_files` per control from the manifest. Use `support_level` to show “Also complete governance” for PARTIAL controls.
- **Governance (18):** User uploads policies/procedures and completes registers; no OS evidence files from this manifest.
- **Hybrid (17):** User provides both OS evidence (per manifest) and governance artifacts; adjudication appears in both the enclave and governance workflows.

### Authoritative lists (app)

- **Enclave evidence mapped:** `ENCLAVE_73_NIST_IDS` / `isEnclaveEvidenceMapped(id)` from `src/lib/compliance/os-evidence-manifest.ts` (loaded from manifest JSON).
- **Governance-only:** `PURE_GOV_CONTROL_IDS` in `src/lib/governance/seed-data.ts` (18). Note: 3.4.3 appears in both the 18 and the 73 manifest; treat as requiring governance + OS evidence.
- **Hybrid:** `HYBRID_GOV_CONTROL_IDS` in `src/lib/governance/seed-data.ts` (17). All 17 are a subset of the 73 enclave manifest; they require both enclave evidence and governance adjudication.

### Traceability

- Machine-readable manifest: **`OS-Evidence-to-NIST-Control-Manifest-73-73.json`** (this directory).
- Validation: run `npm run validate-os-evidence-manifest` to verify schema, counts, disjointness notes, and hybrid overlap.

## Related artifacts

- **Baseline mapping (subset):** `control-plane/docs/windows-server-2025-os-baseline-mapping.v1.json` — machine-ready mapping with validation hints and manual commands.
- **SCTM status:** `TRUST_CODEX/tables/SCTM_FULL_STATUS_LIST.md` — full 110-control list with classification (System-Enforced, Governance, Inherited, N/A).
- **Evidence bundle manifest:** Each run produces `meta/manifest.json` and `meta/hashes.sha256.txt`; file paths in this document align with those outputs.
