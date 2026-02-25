# C3PAO CMMC 2.0 Level 2 — Required Documents and Records (Master List)

**Purpose:** Authoritative list of every document and record type required to pass a C3PAO (Third-Party) CMMC 2.0 Level 2 assessment. This list is the source of truth for a centrally managed governance/evidence app. Assessment is against **NIST SP 800-171 Rev. 2** (110 requirements).

**References:** 32 CFR Part 170, CMMC Assessment Process v2.0, NIST SP 800-171 Rev. 2, DoD CMMC Level 2 Assessment Guide.

**Note:** CA.L2-3.12.4 (System Security Plan) is **not POA&M'able**; the SSP must be complete before certification.

---

## 1. Mandatory Plans and Scope (Not POA&M'able)

| ID | Document/Record Type | Description | NIST / CMMC Reference |
|----|----------------------|-------------|------------------------|
| SSP | System Security Plan | Single comprehensive plan describing system boundary, environment, and how each of the 110 requirements is met (or inherited/N/A). | CA.L2-3.12.4 |
| CMP | Configuration Management Plan | Plan for baseline, change control, and security impact analysis. | CM 3.4.x (governance) |
| IRP | Incident Response Plan | Documented plan for detecting, reporting, and responding to incidents; tested at least annually. | IR 3.6.1, 3.6.2, 3.6.3 |

---

## 2. Policies (One per Domain Where Governance Applies)

| Code | Policy | NIST Section | Control IDs (sample) |
|------|--------|--------------|------------------------|
| POL-AC | Access Control Policy | 3.1 | AC.L2-3.1.1 through 3.1.22 |
| POL-IA | Identification and Authentication Policy | 3.5 | IA.L2-3.5.1 through 3.5.11 |
| POL-AU | Audit and Accountability Policy | 3.3 | AU.L2-3.3.1 through 3.3.9 |
| POL-AT | Awareness and Training Policy | 3.2 | AT.L2-3.2.1, 3.2.2, 3.2.3 |
| POL-CM | Configuration Management Policy | 3.4 | CM.L2-3.4.1 through 3.4.9 |
| POL-IR | Incident Response Policy | 3.6 | IR.L2-3.6.1, 3.6.2, 3.6.3 |
| POL-MA | Maintenance Policy | 3.7 | MA.L2-3.7.1 through 3.7.6 |
| POL-MP | Media Protection Policy | 3.8 | MP.L2-3.8.1 through 3.8.9 |
| POL-PE | Physical and Environmental Protection Policy | 3.10 | PE.L2-3.10.1 through 3.10.6 |
| POL-PS | Personnel Security Policy | 3.9 | PS.L2-3.9.1, 3.9.2 |
| POL-RA | Risk Assessment Policy | 3.11 | RA.L2-3.11.1, 3.11.2, 3.11.3 |
| POL-CA | Security Assessment Policy (Assessment, POA&M, SSP) | 3.12 | CA.L2-3.12.1 through 3.12.4 |
| POL-SC | System and Communications Protection Policy | 3.13 | SC.L2-3.13.1 through 3.13.16 |
| POL-SI | System and Information Integrity Policy | 3.14 | SI.L2-3.14.1 through 3.14.7 |
| POL-SW | Software Restriction / User-Installed Software Policy | 3.4.8, 3.4.9 | CM.L2-3.4.8, 3.4.9 |

---

## 3. Procedures (SOPs)

| Code | Procedure | Primary NIST/Control |
|------|-----------|----------------------|
| SOP-221 | User Account Provisioning and Deprovisioning | AC, IA |
| SOP-222 | Account Lifecycle Enforcement (lockout, revocation, MFA) | AC 3.1.8, IA |
| SOP-223 | Incident Identification and Reporting | IR 3.6.1, 3.6.2 |
| SOP-224 | Physical Environment and Remote Work Controls | PE, AC (remote access) |
| SOP-225 | Configuration Change Awareness / Security Impact Analysis | CM 3.4.3, 3.4.4 |
| SOP-226 | Audit Log Review | AU 3.3.3 |
| SOP-227 | Security Awareness Training | AT 3.2.1, 3.2.2, 3.2.3 |
| SOP-228 | Configuration Baseline Management | CM 3.4.1, 3.4.2, 3.4.5–3.4.9 |
| SOP-229 | Risk Assessment | RA 3.11.1 |
| SOP-230 | Vulnerability Scanning and Remediation | RA 3.11.2, 3.11.3 |
| SOP-231 | POA&M Process | CA 3.12.2, 3.12.3 |
| SOP-232 | Incident Response Testing | IR 3.6.3 |
| SOP-233 | Personnel Screening | PS 3.9.1 |
| SOP-234 | Personnel Termination / Transfer | PS 3.9.2 |
| SOP-235 | Separation of Duties Matrix | AC 3.1.4 |
| SOP-236 | Physical Access Device Control | PE 3.10.5 |
| SOP-237 | Mobile Code Control | SC 3.13.13 |
| SOP-238 | Maintenance Tool Control | MA 3.7.2 |

---

## 4. Forms and Agreements

| Code | Form/Agreement | Purpose |
|------|----------------|---------|
| FRM-203 | User Access and FCI/CUI Handling Acknowledgement | Initial access; CUI handling rules (MP, AC). |
| FRM-204 | CUI Enclave User Agreement and Rules of Behavior | Pre-provisioning agreement; annual re-acknowledgement; AC 3.1.9, acceptable use. |

---

## 5. Records (Ongoing / Generated)

| Record Type | Description | Cadence / Trigger | Typical Owner |
|-------------|-------------|-------------------|---------------|
| POA&M Tracking Log | Active Plan of Action and Milestones with due dates, owners, status | Updated per finding; reviewed at least monthly | ISSO |
| Training Completion Log | Roster of users who completed security awareness training (and date) | Initial + annual | Compliance Officer |
| Incident Log | Incidents detected, reported, and resolved | Per incident | ISSO |
| Incident Response Test Report | Results of annual (or per-SOP) IR test | Annual (min) | ISSO |
| Risk Assessment Report | Output of periodic risk assessment per RA policy | Per policy (e.g., annual) | ISSO / Compliance |
| Security Assessment / Self-Assessment Report | Output of control assessment per CA policy | Annual (and per 32 CFR 170.16 if self-assessment) | ISSO |
| Audit Log Review Record | Evidence that audit logs were reviewed per SOP | Per SOP-226 (e.g., weekly/monthly) | IT Admin / ISSO |
| Vulnerability Scan Results | Scan outputs and remediation status | Per SOP-230 (e.g., weekly/monthly) | IT Admin |
| Vulnerability Remediation Log | Tracking of vuln remediation and timelines | Per remediation | IT Admin |
| Configuration Change / Security Impact Analysis | Record for each change with security impact | Per change | IT Admin / Change Owner |
| Personnel Screening Record | Evidence of screening prior to CUI access | Per hire/transfer | Compliance / HR |
| Personnel Termination / Transfer Checklist | Access revocation and asset return per SOP-234 | Per termination/transfer | Compliance / HR |
| Document Approval / Sign-off Record | Policy/SOP/plan approval (reviewed by, approved by, date) | Per document version | Compliance Officer |
| N/A Justification Memos | Documented rationale for controls deemed Not Applicable | Per control (AC 3.1.16/17, MA 3.7.3/4, PE 3.10.6, SC 3.13.7/14) | ISSO |
| Inherited Control Statement | How provider (e.g., Azure) satisfies PE (and other inherited) controls | Annual + material provider change | Compliance Officer |

---

## 6. System Scope and Architecture (Supporting Docs)

| Document | Description |
|----------|-------------|
| System Boundary / Scope Statement | In-scope components and data (CUI/FCI boundary). |
| System Description and Architecture | High-level architecture; in-scope assets; data flows. |
| Architecture Diagram | Diagram of CUI system and boundary. |
| Data Flow Diagram | Flow of CUI/FCI. |
| FCI/CUI Scope and Data Boundary Statement | Formal boundary and data handling summary. |

---

## 7. Assessment and Traceability

| Document | Description |
|----------|-------------|
| System Control Traceability Matrix (SCTM) | Mapping of each of 110 requirements to implementation, policy, procedure, evidence. |
| Evidence Index | Where evidence for each control is stored; retention; regeneration method. |
| Assessment Day Runbook / Demonstration Runbook | Steps and evidence to show during C3PAO assessment. |

---

## 8. Supporting Guides (Implementation / How-To)

| Document | Description |
|----------|-------------|
| MFA Implementation Guide | How MFA is implemented (IA 3.5.3, etc.). |
| Audit Logging Configuration Guide | How audit logging is configured and protected (AU). |

---

## 9. Evidence Artifacts (Technical; Stored in Evidence Vault)

Generated by systems or scripts; referenced by Evidence Index. Examples:

- VM/enclave evidence snapshots (e.g., `CUI-Evidence-<RunId>`): audit policy, firewall, RDP config, account policy, Defender status, FIPS, etc.
- Validation reports (e.g., `validation-report.json`).
- Entra/Conditional Access exports, sign-in logs (where applicable).
- Provider attestations (e.g., Azure) for inherited controls.

---

## 10. Summary Count (for Bundle/App)

| Category | Count (this pilot) |
|----------|---------------------|
| Plans (SSP, CMP, IRP) | 3 |
| Policies | 17 |
| Procedures (SOPs) | 18 |
| Forms/Agreements | 2 |
| Record types (logs, reports, checklists) | 14+ |
| Scope/architecture docs | 5+ |
| Assessment/traceability docs | 3 |
| Supporting guides | 2 |
| **Total governance document types** | **~64** (excluding one-off evidence files) |

---

## 11. Document Control Requirements (Adjudicated Use)

For real adjudicated use (no boilerplate):

- Every policy, procedure, and plan must have **Document Control** completed: Prepared By, Reviewed By, Approved By, Next Review Date.
- No "[To be completed]" or "TBD" in approved versions.
- Forms may retain blanks for user/date; Document Control block for the form template itself should be completed.
- Approval records (sign-off) should be stored in a designated evidence location (e.g., `C:\evidence\CUI-Doc-Signoff-<RunId>\` or equivalent in central app).

---

*This master list can be exported to JSON or imported into a central governance app so the app ingests the bundle and knows every required document and record.*
