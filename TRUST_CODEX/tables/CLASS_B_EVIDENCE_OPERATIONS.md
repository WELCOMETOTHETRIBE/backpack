# Class B Evidence Operations

Governance/policy (Class B) controls are satisfied primarily by **required records**, **templates**, and **cadence** maintained by the designated owner. This table defines the operational requirements and vault bundle paths for each Class B control so that evidence can be produced on schedule and placed in the encrypted evidence vault for assessor handoff.

**Vault base for Class B**: `\\EvidenceVault\CUI-Enclave\governance\<ControlId>\<YYYY>\`

- **Required records**: Minimum set of documents/records that must exist for the control to be considered satisfied.
- **Templates / policy reference**: Where to find the template or the governing policy/SOP.
- **Cadence**: How often to generate, review, or refresh evidence.
- **Bundle path**: Exact vault path where the annual (or per-cadence) bundle should be placed. Per VAULT_LAYOUT, governance uses `<ControlId>\<YYYY>\` (e.g. by calendar year).

---

| Control ID | NIST Req | Control name | Owner role | Required records | Templates / policy reference | Cadence | Vault bundle path |
|------------|----------|--------------|------------|------------------|------------------------------|---------|-------------------|
| AC.L2-3.1.4 | 3.1.4 | Separate duties | Compliance Officer | Role matrix or equivalent; approval/designation records; independent review evidence | MAC-POL-210; MAC-RPT-121_3_1_4_separate_duties_Evidence, MAC-RPT-117_Separation_of_Duties_Enforcement_Evidence | Per-change + annual review | `\...\governance\AC.L2-3.1.4\<YYYY>\` |
| AT.L2-3.2.1 | 3.2.1 | Security awareness | Compliance Officer | Training completion log; annual re-acknowledgement records | MAC-POL-219; MAC-SOP-227 | Initial + annual | `\...\governance\AT.L2-3.2.1\<YYYY>\` |
| AT.L2-3.2.2 | 3.2.2 | Security training | Compliance Officer | Training completion log; annual re-acknowledgement records | MAC-POL-219; MAC-SOP-227 | Initial + annual | `\...\governance\AT.L2-3.2.2\<YYYY>\` |
| AT.L2-3.2.3 | 3.2.3 | Insider threat awareness | Compliance Officer | Training completion log; annual re-acknowledgement records | MAC-POL-219; MAC-SOP-227 | Initial + annual | `\...\governance\AT.L2-3.2.3\<YYYY>\` |
| AU.L2-3.3.3 | 3.3.3 | Review and update logged events | Compliance Officer | Review log or memo; updated event list/scope record | MAC-POL-218; MAC-SOP-226 | Per-change + annual review | `\...\governance\AU.L2-3.3.3\<YYYY>\` |
| CM.L2-3.4.3 | 3.4.3 | Change control | Compliance Officer | Change request/approval records; security impact notation | MAC-POL-220; MAC-RPT-121_3_4_3_change_control_Evidence | Per-change + annual review | `\...\governance\CM.L2-3.4.3\<YYYY>\` |
| CM.L2-3.4.4 | 3.4.4 | Security impact analysis | Compliance Officer | Security impact analysis for changes (or reference to change record that includes it) | MAC-POL-220; MAC-SOP-225 | Per-change + annual review | `\...\governance\CM.L2-3.4.4\<YYYY>\` |
| IR.L2-3.6.1 | 3.6.1 | Operational incident-handling capability | ISSO | Incident response capability description; contact/escalation list; annual review record | MAC-POL-215; MAC-RPT-121_3_6_1_operational_incident_handling_capability_Evidence | As incidents occur + annual test | `\...\governance\IR.L2-3.6.1\<YYYY>\` |
| IR.L2-3.6.2 | 3.6.2 | Track, document, and report incidents | ISSO | Incident log (or ticket export); escalation/report records | MAC-POL-215; MAC-RPT-121_3_6_2_track_document_and_report_incidents_Evidence | As incidents occur + annual test | `\...\governance\IR.L2-3.6.2\<YYYY>\` |
| IR.L2-3.6.3 | 3.6.3 | Test incident response capability | ISSO | IR test report (annual); exercise date and outcome | MAC-POL-215; MAC-SOP-232 | As incidents occur + annual test | `\...\governance\IR.L2-3.6.3\<YYYY>\` |
| MA.L2-3.7.6 | 3.7.6 | Supervise maintenance personnel | Compliance Officer | Supervision procedure; log or record of supervised maintenance (if applicable) | MAC-POL-221 | Per-change + annual review | `\...\governance\MA.L2-3.7.6\<YYYY>\` |
| PS.L2-3.9.1 | 3.9.1 | Screen individuals prior to access | Compliance Officer | Screening checklist or log; background check/verification (per policy) | MAC-POL-222; MAC-SOP-233 | Per personnel action + annual review | `\...\governance\PS.L2-3.9.1\<YYYY>\` |
| PS.L2-3.9.2 | 3.9.2 | Protect systems during/after personnel actions | Compliance Officer | Termination/transfer checklist; access revocation record; inventory/return record | MAC-POL-222; MAC-RPT-121_3_9_2_protect_systems_during_after_personnel_actions_Evidence | Per personnel action + annual review | `\...\governance\PS.L2-3.9.2\<YYYY>\` |
| RA.L2-3.11.1 | 3.11.1 | Periodically assess risk | Compliance Officer | Risk assessment report (scope, methodology, findings, approvals) | MAC-POL-223; MAC-RPT-121_3_11_1_periodically_assess_risk_Evidence | Per policy (e.g. annual) + per material change | `\...\governance\RA.L2-3.11.1\<YYYY>\` |
| CA.L2-3.12.1 | 3.12.1 | Periodically assess security controls | ISSO | Validation report (validation-report.json/txt from Test-CuiHardening.ps1); control assessment summary | MAC-POL-224; MAC-RPT-121_3_12_1_periodically_assess_security_controls_Evidence | Per build + monthly | `\...\governance\CA.L2-3.12.1\<YYYY>\` |
| CA.L2-3.12.2 | 3.12.2 | Develop and implement POA&M | ISSO | POA&M document or export; tracking log with milestones | MAC-POL-224; MAC-RPT-121_3_12_2_develop_and_implement_poa_m_Evidence | Annual + monthly POA&M review | `\...\governance\CA.L2-3.12.2\<YYYY>\` |
| CA.L2-3.12.3 | 3.12.3 | Monitor security controls | ISSO | Control monitoring log or report; evidence of periodic review | MAC-POL-224; MAC-RPT-121_3_12_3_monitor_security_controls_Evidence | Annual + monthly POA&M review | `\...\governance\CA.L2-3.12.3\<YYYY>\` |
| CA.L2-3.12.4 | 3.12.4 | Develop/update SSP | ISSO | System Security Plan (or update memo with version/date) | MAC-POL-224; MAC-RPT-121_3_12_4_develop_update_ssp_Evidence | Annual + monthly POA&M review | `\...\governance\CA.L2-3.12.4\<YYYY>\` |

---

## Bundle contents per control

For each Class B control, the bundle at the vault path above should contain:

1. **Required records** listed in the table (versioned or dated).
2. **Approval/review record** where applicable (e.g. annual review sign-off).
3. **Hash manifest** (optional but recommended) for integrity.

Governance docs that live in the governance bundle (e.g. MAC-POL-xxx) may be stored in a shared governance library and **referenced** from the control folder (e.g. a `manifest.txt` listing which policy versions apply to that control and year).

## Cadence summary

| Cadence | Controls |
|---------|----------|
| Per-change + annual review | AC.L2-3.1.4, AU.L2-3.3.3, CM.L2-3.4.3, CM.L2-3.4.4, MA.L2-3.7.6, PS.L2-3.9.1, PS.L2-3.9.2 |
| Initial + annual | AT.L2-3.2.1, AT.L2-3.2.2, AT.L2-3.2.3 |
| As incidents + annual test | IR.L2-3.6.1, IR.L2-3.6.2, IR.L2-3.6.3 |
| Annual + per material change | RA.L2-3.11.1 |
| Per build + monthly | CA.L2-3.12.1 |
| Annual + monthly POA&M review | CA.L2-3.12.2, CA.L2-3.12.3, CA.L2-3.12.4 |

## References

- **Vault layout**: `TRUST_CODEX/vault/VAULT_LAYOUT.md` — Governance (Class B) section.
- **Evidence index**: `TRUST_CODEX/tables/EVIDENCE_INDEX.md` (generated from `evidence-index.json`).
- **Control mapping**: `TRUST_CODEX/tables/CONTROL_MAPPING_800-171R2.md` — governance references (MAC-POL, MAC-SOP, MAC-RPT).
- **Per-control bundle generator**: `TRUST_CODEX/tools/package_control_evidence.py` — can package governance artifacts into assessor-ready bundles when given run/governance paths.
