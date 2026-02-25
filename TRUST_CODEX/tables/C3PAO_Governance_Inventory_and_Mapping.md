# C3PAO Governance Inventory and Mapping

**Purpose:** Map every required CMMC L2 governance document/record (from `C3PAO_CMMC_L2_Required_Documents_and_Records.md`) to what exists in this repo. **Status** = Present, Missing, or Template (needs adjudication).

**Master list:** `C3PAO_CMMC_L2_Required_Documents_and_Records.md`

---

## 1. Mandatory Plans

| Required | Our Doc ID | Location | Status | Notes |
|----------|------------|----------|--------|-------|
| System Security Plan | MAC-IT-304 | `governance/.../01-system-scope/MAC-IT-304_System_Security_Plan.md` | Present | Template header/placeholders to remove for adjudication. |
| Configuration Management Plan | MAC-CMP-001 | `governance/.../02-policies-and-procedures/MAC-CMP-001_Configuration_Management_Plan.md` | Present | In manifest; verify no boilerplate. |
| Incident Response Plan | MAC-IRP-001 | `governance/.../02-policies-and-procedures/MAC-IRP-001_Incident_Response_Plan.md` | Present | Template header/placeholders to remove. |

---

## 2. Policies

| Required (Code) | Our Doc ID | Location | Status | Notes |
|-----------------|------------|----------|--------|-------|
| POL-AC | MAC-POL-210 | `.../02-policies-and-procedures/MAC-POL-210_Access_Control_Policy.md` | Present | Template; "[To be completed]"; fix 9.2 vs 8.2 lockout consistency. |
| POL-IA | MAC-POL-211 | `.../02-policies-and-procedures/MAC-POL-211_Identification_and_Authentication_Policy.md` | Present | Template header; Document Control TBD. |
| POL-AU | MAC-POL-218 | `.../02-policies-and-procedures/MAC-POL-218_Audit_and_Accountability_Policy.md` | Present | Template; Document Control TBD. |
| POL-AT | MAC-POL-219 | `.../02-policies-and-procedures/MAC-POL-219_Awareness_and_Training_Policy.md` | Present | Template; Document Control TBD. |
| POL-CM | MAC-POL-220 | `.../02-policies-and-procedures/MAC-POL-220_Configuration_Management_Policy.md` | Present | Template; Document Control TBD. |
| POL-IR | MAC-POL-215 | `.../02-policies-and-procedures/MAC-POL-215_Incident_Response_Policy.md` | Present | Template; IR contact "[To be completed]"; Document Control TBD. |
| POL-MA | MAC-POL-221 | `.../02-policies-and-procedures/MAC-POL-221_Maintenance_Policy.md` | Present | In manifest. |
| POL-MP | MAC-POL-213 | `.../02-policies-and-procedures/MAC-POL-213_Media_Handling_Policy.md` | Present | In manifest. |
| POL-PE | MAC-POL-212 | `.../02-policies-and-procedures/MAC-POL-212_Physical_Security_Policy.md` | Present | In manifest. |
| POL-PS | MAC-POL-222 | `.../02-policies-and-procedures/MAC-POL-222_Personnel_Security_Policy.md` | Present | Template; Document Control TBD. |
| POL-RA | MAC-POL-223 | `.../02-policies-and-procedures/MAC-POL-223_Risk_Assessment_Policy.md` | Present | In manifest. |
| POL-CA | MAC-POL-224 | `.../02-policies-and-procedures/MAC-POL-224_Security_Assessment_Policy.md` | Present | Template; Document Control TBD. |
| POL-SC | MAC-POL-225 | `.../02-policies-and-procedures/MAC-POL-225_System_and_Communications_Protection_Policy.md` | Present | In manifest. |
| POL-SI | MAC-POL-214, MAC-POL-216 | `.../MAC-POL-214_System_Integrity_Policy.md`, `.../MAC-POL-216_System_Integrity_Policy_Reference.md` | Present | In manifest. |
| POL-SW | MAC-POL-226 | `.../02-policies-and-procedures/MAC-POL-226_Software_Restriction_Policy.md` | Present | In manifest. |
| (Stakeholder) | MAC-POL-217 | `.../MAC-POL-217_Ongoing_Stakeholder_Requirements.md` | Present | In manifest. |

**Policies:** All required policies are **present**. All need **adjudication** (remove "PLATFORM-AGNOSTIC TEMPLATE", complete Document Control, remove "[To be completed]").

---

## 3. Procedures (SOPs)

| Required (Code) | Our Doc ID | Location | Status | Notes |
|-----------------|------------|----------|--------|-------|
| SOP-221 | MAC-SOP-221 | `.../02-policies-and-procedures/MAC-SOP-221_User_Account_Provisioning_and_Deprovisioning_Procedure.md` | Present | In manifest. |
| SOP-222 | MAC-SOP-222 | `.../MAC-SOP-222_Account_Lifecycle_Enforcement_Procedure.md` | Present | In manifest. |
| SOP-223 | MAC-SOP-223 | `.../MAC-SOP-223_Incident_Identification_and_Reporting_Procedure.md` | Present | In manifest. |
| SOP-224 | MAC-SOP-224 | `.../MAC-SOP-224_Physical_Environment_and_Remote_Work_Controls.md` | Present | In manifest. |
| SOP-225 | MAC-SOP-225 | `.../MAC-SOP-225_Configuration_Change_Awareness_Procedure.md` | Present | In manifest. |
| SOP-226 | MAC-SOP-226 | `.../MAC-SOP-226_Audit_Log_Review_Procedure.md` | Present | In manifest. |
| SOP-227 | MAC-SOP-227 | `.../MAC-SOP-227_Security_Awareness_Training_Procedure.md` | Present | Template; Document Control TBD. |
| SOP-228 | MAC-SOP-228 | `.../MAC-SOP-228_Configuration_Baseline_Management_Procedure.md` | Present | In manifest. |
| SOP-229 | MAC-SOP-229 | `.../MAC-SOP-229_Risk_Assessment_Procedure.md` | Present | In manifest. |
| SOP-230 | MAC-SOP-230 | `.../MAC-SOP-230_Vulnerability_Scanning_Procedure.md` | Present | In manifest. |
| SOP-231 | MAC-SOP-231 | `.../MAC-SOP-231_POA&M_Process_Procedure.md` | Present | Template; Document Control TBD. |
| SOP-232 | MAC-SOP-232 | `.../MAC-SOP-232_Incident_Response_Testing_Procedure.md` | Present | In manifest. |
| SOP-233 | MAC-SOP-233 | `.../MAC-SOP-233_Personnel_Screening_Procedure.md` | Present | In manifest. |
| SOP-234 | MAC-SOP-234 | `.../MAC-SOP-234_Personnel_Termination_Procedure.md` | Present | In manifest. |
| SOP-235 | MAC-SOP-235 | `.../MAC-SOP-235_Separation_of_Duties_Matrix.md` | Present | In manifest. |
| SOP-236 | MAC-SOP-236 | `.../MAC-SOP-236_Physical_Access_Device_Control_Procedure.md` | Present | In manifest. |
| SOP-237 | MAC-SOP-237 | `.../MAC-SOP-237_Mobile_Code_Control_Procedure.md` | Present | In manifest. |
| SOP-238 | MAC-SOP-238 | `.../MAC-SOP-238_Maintenance_Tool_Control_Procedure.md` | Present | In manifest. |

**Procedures:** All 18 required SOPs are **present**. Some have template/Document Control to complete.

---

## 4. Forms and Agreements

| Required | Our Doc ID | Location | Status | Notes |
|----------|------------|----------|--------|-------|
| User Access and FCI/CUI Acknowledgement | MAC-FRM-203 | `.../02-policies-and-procedures/MAC-FRM-203_User_Access_and_FCI_Handling_Acknowledgement.md` | Present | Referenced in SSP; in manifest. |
| CUI Enclave User Agreement and Rules of Behavior | MAC-FRM-204 | `.../02-policies-and-procedures/MAC-FRM-204_CUI_Enclave_User_Agreement_and_Rules_of_Behavior.md` | Present | Template header; Document Control TBD. |

---

## 5. Records (Ongoing)

| Record Type | Where Stored / Documented | Status | Notes |
|-------------|---------------------------|--------|-------|
| POA&M Tracking Log | MAC-AUD-405 in `.../04-self-assessment/MAC-AUD-405_POA&M_Tracking_Log.md`; app `/admin/poam` | Present | Log file present in TRUST_CODEX; live data in app. |
| Training Completion Log | Governance records; MAC-SOP-227 | Procedure present | Log template/export per procedure. |
| Incident Log | Governance records; MAC-POL-215 / MAC-SOP-223 | Procedure present | Log per procedure. |
| IR Test Report | Governance records; MAC-SOP-232 | Procedure present | Annual test output. |
| Risk Assessment Report | Governance records; MAC-SOP-229 | Procedure present | Per policy cadence. |
| Security Self-Assessment Report | CA 3.12.x; MAC-AUD-408 SCTM; validation reports | Present | SCTM + validation-report.json. |
| Audit Log Review Record | MAC-SOP-226; evidence | Procedure present | Evidence of review. |
| Vulnerability Scan Results | Evidence vault; MAC-SOP-230 | Procedure present | Per SOP. |
| Vulnerability Remediation Log | Evidence / MAC-SOP-230 | Procedure present | Per SOP. |
| Configuration Change / SIA | MAC-SOP-225; change records | Procedure present | Per change. |
| Personnel Screening Record | MAC-SOP-233; template ref in POL-222 | Procedure present | Screening records template path in POL-222. |
| Termination/Transfer Checklist | MAC-SOP-234 | Present | Procedure defines checklist. |
| Document Approval / Sign-off | C:\evidence\CUI-Doc-Signoff-* (manual app) | Present | Per-document sign-off from manual app. |
| N/A Justification Memos | TRUST_CODEX/chapters/02_CUI_Boundary; EVIDENCE_INDEX | Present | AC 3.1.16/17, MA 3.7.3/4, PE 3.10.6, SC 3.13.7/14. |
| Inherited Control Statement | MAC-SEC-312 (Azure); azure-inheritance | Present | In mactech/compliance. CUI boundary is Windows Server 2025 VM on Microsoft Azure only. |

**Records:** No **missing** record types. Operational logs (training, incident, POA&M, vuln) must be **populated** per procedures.

---

## 6. System Scope and Architecture

| Required | Our Doc ID / Location | Status |
|----------|------------------------|--------|
| System Boundary / Scope | MAC-IT-105, MAC-SEC-302 | Present |
| System Description and Architecture | MAC-IT-301 | Present (mactech + TRUST_CODEX) |
| Architecture Diagram | MAC-IT-306 | Present |
| Data Flow Diagram | MAC-IT-305 | Present |
| FCI/CUI Scope and Boundary Statement | MAC-SEC-302, MAC-SEC-303 | Present |

---

## 7. Assessment and Traceability

| Required | Our Doc / Location | Status |
|----------|--------------------|--------|
| SCTM | MAC-AUD-408 (mactech); sctm-data.json (TRUST_CODEX) | Present |
| Evidence Index | EVIDENCE_INDEX.md (from evidence-index.json) | Present |
| Assessment Day Runbook | MAC-AUD-160 (mactech) | Present |

---

## 8. Supporting Guides

| Required | Our Doc | Location | Status |
|----------|----------|----------|--------|
| MFA Implementation Guide | MAC-SEC-108 | `.../06-supporting-documents/MAC-SEC-108_MFA_Implementation_Guide.md` | Present | Template; Document Control TBD. |
| Audit Logging Configuration Guide | MAC-SEC-109 | `.../06-supporting-documents/MAC-SEC-109_Audit_Logging_Configuration_Guide.md` | Present | Template; Document Control TBD. |

---

## 9. Gaps and Actions

### Documents not yet created (none)

All required governance **document types** in the master list are represented by an existing file. No net-new documents need to be created for the list.

### Adjudication required (no boilerplate/template)

1. **Remove from all governance docs:**  
   - Header block: `# PLATFORM-AGNOSTIC TEMPLATE (REFERENCE ONLY)` and the "Rules for reuse" / "Status: sanitized..." paragraph.  
   - Replace with adjudicated status (e.g., "Approved for CUI Enclave" or leave as title only).

2. **Document Control:**  
   - Replace every `**[To be completed]**` and `**[TBD]**` in Reviewed By, Approved By, Next Review Date with either real values or a standard placeholder that indicates "to be completed at approval" (e.g., "—" or "Per release process").

3. **Incident Response Policy (MAC-POL-215):**  
   - Fill in contact placeholders: Phone, Escalation, and any "[To be completed]" in contact section.

4. **Access Control Policy (MAC-POL-210):**  
   - Fix inconsistency: Section 9.2 says "❌ Account lockout (3.1.8) - To be implemented" but Section 8.2 states "✅ Implemented". Set 9.2 to "✅ Implemented" and remove "To be defined" in lockout configuration if values are now set (e.g., 5 attempts, 30-minute lockout).

5. **Hosting/provider placeholders:**  
   - Replace any "hosting environment (historical)" or generic placeholders with the actual environment name (e.g., Microsoft Azure) where the document is used for the adjudicated system.

### Optional (for central app) — completed

- **05-evidence templates:** Present in TRUST_CODEX under `.../level2/05-evidence/`: `security-impact-analysis/security-impact-analysis-template.md`, `personnel-screening/screening-records-template.md`, `templates/endpoint-av-verification-template.md`, `templates/vuln-remediation-log-template.md`, `templates/physical-access-log-procedure.md`. All paths referenced in SSP, POL-212, POL-214, POL-217, POL-220, POL-222, MAC-SOP-225, MAC-SEC-101, MAC-AUD-408 now resolve.
- **POA&M Tracking Log:** MAC-AUD-405 file present at `.../04-self-assessment/MAC-AUD-405_POA&M_Tracking_Log.md`; authoritative live log in app at `/admin/poam`; referenced in bundle manifest.

---

## 10. Mapping to Master List IDs (for App Ingestion)

The central app can use this mapping to match bundle files to the master list:

- **Plans:** SSP → MAC-IT-304; CMP → MAC-CMP-001; IRP → MAC-IRP-001.
- **Policies:** POL-AC → MAC-POL-210; POL-IA → MAC-POL-211; … (see Section 2 above).
- **Procedures:** SOP-221 → MAC-SOP-221; … (see Section 3).
- **Forms:** FRM-203 → MAC-FRM-203; FRM-204 → MAC-FRM-204.
- **Records:** Stored as operational data or in evidence paths; see master list Section 5 and EVIDENCE_INDEX.md.

Use `governance-manifest.json` + this inventory for a complete list of governance document IDs and paths in the bundle.
