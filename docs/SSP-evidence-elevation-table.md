# SSP — Evidence Elevation Audit (Phase D)

**Org:** mactech-solutions-llc
**Generated:** 2026-05-09T10:21:19.147Z
**Source:** canonical adjudication snapshots + family-driven pipeline heuristics + per-control overrides

## Headline numbers

Today's canonical state:
- **86** MET · **10** N/A · **14** NOT MET (= 96 defensible)

Migration effort to push every control onto an evidence-backed (or ESP-inherited) path:
- **77** controls already wired (no migration needed)
- **17** small effort (single bridge endpoint, register provisioning, or attestation declaration)
- **16** medium effort (process changes + integration work)
- **0** large effort (HR-system integration or similar)
- **0** blocker (no path identified — manual SSP narrative remains the only option)

## Per-control table

| Control | Family | Today's met_via | Today's finding | Achievable path | Pipeline | Effort | Rationale |
|---|---|---|---|---|---|---|---|
| `3.1.1` | AC | `evidence` | MET | evidence (technical) + governance register | OS evidence collector (AD/Entra/local accounts) + register | wired | — |
| `3.1.2` | AC | `evidence` | MET | evidence (technical) + governance register | OS evidence collector (AD/Entra/local accounts) + register | wired | — |
| `3.1.3` | AC | `evidence` | MET | evidence (technical) + governance register | OS evidence collector (AD/Entra/local accounts) + register | wired | — |
| `3.1.4` | AC | `not_met` | NOT_MET | evidence (technical) + governance register | OS evidence collector (AD/Entra/local accounts) + register | wired | — |
| `3.1.5` | AC | `evidence` | MET | evidence (technical) + governance register | OS evidence collector (AD/Entra/local accounts) + register | wired | — |
| `3.1.6` | AC | `evidence` | MET | evidence (technical) + governance register | OS evidence collector (AD/Entra/local accounts) + register | wired | — |
| `3.1.7` | AC | `evidence` | MET | evidence (technical) + governance register | OS evidence collector (AD/Entra/local accounts) + register | wired | — |
| `3.1.8` | AC | `evidence` | MET | evidence (technical) + governance register | OS evidence collector (AD/Entra/local accounts) + register | wired | — |
| `3.1.9` | AC | `evidence` | MET | evidence (technical) + governance register | OS evidence collector (AD/Entra/local accounts) + register | wired | — |
| `3.1.10` | AC | `evidence` | MET | evidence (technical) + governance register | OS evidence collector (AD/Entra/local accounts) + register | wired | — |
| `3.1.11` | AC | `evidence` | MET | evidence (technical) + governance register | OS evidence collector (AD/Entra/local accounts) + register | wired | — |
| `3.1.12` | AC | `evidence` | MET | evidence (technical) + governance register | OS evidence collector (AD/Entra/local accounts) + register | wired | — |
| `3.1.13` | AC | `evidence` | MET | evidence (technical) + governance register | OS evidence collector (AD/Entra/local accounts) + register | wired | — |
| `3.1.14` | AC | `evidence` | MET | evidence (technical) + governance register | OS evidence collector (AD/Entra/local accounts) + register | wired | — |
| `3.1.15` | AC | `not_met` | NOT_MET | evidence (technical) + governance register | OS evidence collector (AD/Entra/local accounts) + register | wired | — |
| `3.1.16` | AC | `not_applicable` | NA | operator-declared not_applicable | control_status_overrides with rationale | wired | No wireless infrastructure within CUI boundary — declare N/A. |
| `3.1.17` | AC | `not_applicable` | NA | operator-declared not_applicable | control_status_overrides with rationale | wired | Same as 3.1.16 — no wireless infrastructure. |
| `3.1.18` | AC | `evidence` | MET | operator-declared not_applicable | control_status_overrides with rationale | wired | No mobile devices in CUI enclave — declare N/A. |
| `3.1.19` | AC | `evidence` | MET | operator-declared not_applicable | control_status_overrides with rationale | wired | Same as 3.1.18 — no mobile CUI. |
| `3.1.20` | AC | `not_met` | NOT_MET | evidence (technical) + governance register | OS evidence collector (AD/Entra/local accounts) + register | wired | — |
| `3.1.21` | AC | `evidence` | MET | evidence (technical) + governance register | OS evidence collector (AD/Entra/local accounts) + register | wired | — |
| `3.1.22` | AC | `not_met` | NOT_MET | evidence (technical) + governance register | OS evidence collector (AD/Entra/local accounts) + register | wired | — |
| `3.2.1` | AT | `not_met` | NOT_MET | evidence (TrainOS-archived training completions) | TrainOS training-record bundle pull | small | — |
| `3.2.2` | AT | `not_met` | NOT_MET | evidence (TrainOS-archived training completions) | TrainOS training-record bundle pull | small | — |
| `3.2.3` | AT | `not_met` | NOT_MET | evidence (TrainOS-archived training completions) | TrainOS training-record bundle pull | small | — |
| `3.3.1` | AU | `evidence` | MET | evidence (technical, register) | Vault audit-event ingest (Codex audit_events_register) | small | — |
| `3.3.2` | AU | `evidence` | MET | evidence (technical, register) | Vault audit-event ingest (Codex audit_events_register) | small | — |
| `3.3.3` | AU | `evidence` | MET | evidence (technical, register) | Vault audit-event ingest (Codex audit_events_register) | small | — |
| `3.3.4` | AU | `evidence` | MET | evidence (technical, register) | Vault audit-event ingest (Codex audit_events_register) | small | — |
| `3.3.5` | AU | `evidence` | MET | evidence (technical, register) | Vault audit-event ingest (Codex audit_events_register) | small | — |
| `3.3.6` | AU | `evidence` | MET | evidence (technical, register) | Vault audit-event ingest (Codex audit_events_register) | small | — |
| `3.3.7` | AU | `evidence` | MET | evidence (technical, register) | Vault audit-event ingest (Codex audit_events_register) | small | — |
| `3.3.8` | AU | `evidence` | MET | evidence (technical, register) | Vault audit-event ingest (Codex audit_events_register) | small | — |
| `3.3.9` | AU | `evidence` | MET | evidence (technical, register) | Vault audit-event ingest (Codex audit_events_register) | small | — |
| `3.4.1` | CM | `evidence` | MET | evidence (qms_doc + register) | QMS document digest + change-drift register | wired | — |
| `3.4.2` | CM | `evidence` | MET | evidence (qms_doc + register) | QMS document digest + change-drift register | wired | — |
| `3.4.3` | CM | `evidence` | MET | evidence (qms_doc + register) | QMS document digest + change-drift register | wired | — |
| `3.4.4` | CM | `evidence` | MET | evidence (qms_doc + register) | QMS document digest + change-drift register | wired | — |
| `3.4.5` | CM | `not_met` | NOT_MET | evidence (qms_doc + register) | QMS document digest + change-drift register | wired | — |
| `3.4.6` | CM | `evidence` | MET | evidence (qms_doc + register) | QMS document digest + change-drift register | wired | — |
| `3.4.7` | CM | `evidence` | MET | evidence (qms_doc + register) | QMS document digest + change-drift register | wired | — |
| `3.4.8` | CM | `evidence` | MET | evidence (qms_doc + register) | QMS document digest + change-drift register | wired | — |
| `3.4.9` | CM | `evidence` | MET | evidence (qms_doc + register) | QMS document digest + change-drift register | wired | — |
| `3.5.1` | IA | `evidence` | MET | evidence (technical) | Entra/Azure validators + OS evidence collector | wired | — |
| `3.5.2` | IA | `evidence` | MET | evidence (technical) | Entra/Azure validators + OS evidence collector | wired | — |
| `3.5.3` | IA | `evidence` | MET | evidence (technical) | Entra/Azure validators + OS evidence collector | wired | — |
| `3.5.4` | IA | `evidence` | MET | evidence (technical) | Entra/Azure validators + OS evidence collector | wired | — |
| `3.5.5` | IA | `evidence` | MET | evidence (technical) | Entra/Azure validators + OS evidence collector | wired | — |
| `3.5.6` | IA | `evidence` | MET | evidence (technical) | Entra/Azure validators + OS evidence collector | wired | — |
| `3.5.7` | IA | `evidence` | MET | evidence (technical) | Entra/Azure validators + OS evidence collector | wired | — |
| `3.5.8` | IA | `evidence` | MET | evidence (technical) | Entra/Azure validators + OS evidence collector | wired | — |
| `3.5.9` | IA | `evidence` | MET | evidence (technical) | Entra/Azure validators + OS evidence collector | wired | — |
| `3.5.10` | IA | `evidence` | MET | evidence (technical) | Entra/Azure validators + OS evidence collector | wired | — |
| `3.5.11` | IA | `evidence` | MET | evidence (technical) | Entra/Azure validators + OS evidence collector | wired | — |
| `3.6.1` | IR | `evidence` | MET | evidence (ir_bundle) | TrainOS IR tabletop bundle (ir_exercise_bundles mirror) | wired | — |
| `3.6.2` | IR | `evidence` | MET | evidence (ir_bundle) | TrainOS IR tabletop bundle (ir_exercise_bundles mirror) | wired | — |
| `3.6.3` | IR | `not_met` | NOT_MET | evidence (ir_bundle) | TrainOS IR tabletop bundle (ir_exercise_bundles mirror) | wired | — |
| `3.7.1` | MA | `evidence` | MET | evidence (technical + ISSO-weekly review register) | Bastion/MFA-on-maintenance + ISSO weekly maintenance log review | medium | — |
| `3.7.2` | MA | `not_met` | NOT_MET | evidence (technical + ISSO-weekly review register) | Bastion/MFA-on-maintenance + ISSO weekly maintenance log review | medium | — |
| `3.7.3` | MA | `not_applicable` | NA | evidence (technical + ISSO-weekly review register) | Bastion/MFA-on-maintenance + ISSO weekly maintenance log review | medium | — |
| `3.7.4` | MA | `not_applicable` | NA | evidence (technical + ISSO-weekly review register) | Bastion/MFA-on-maintenance + ISSO weekly maintenance log review | medium | — |
| `3.7.5` | MA | `not_met` | NOT_MET | evidence (technical + ISSO-weekly review register) | Bastion/MFA-on-maintenance + ISSO weekly maintenance log review | medium | — |
| `3.7.6` | MA | `not_applicable` | NA | evidence (technical + ISSO-weekly review register) | Bastion/MFA-on-maintenance + ISSO weekly maintenance log review | medium | — |
| `3.8.1` | MP | `evidence` | MET | evidence (register) + ESP inheritance for some | Media disposition register + portable-storage OS check | medium | — |
| `3.8.2` | MP | `evidence` | MET | evidence (register) + ESP inheritance for some | Media disposition register + portable-storage OS check | medium | — |
| `3.8.3` | MP | `evidence` | MET | evidence (register) + ESP inheritance for some | Media disposition register + portable-storage OS check | medium | — |
| `3.8.4` | MP | `not_applicable` | NA | evidence (register) + ESP inheritance for some | Media disposition register + portable-storage OS check | medium | — |
| `3.8.5` | MP | `not_applicable` | NA | evidence (register) + ESP inheritance for some | Media disposition register + portable-storage OS check | medium | — |
| `3.8.6` | MP | `evidence` | MET | evidence (register) + ESP inheritance for some | Media disposition register + portable-storage OS check | medium | — |
| `3.8.7` | MP | `evidence` | MET | evidence (register) + ESP inheritance for some | Media disposition register + portable-storage OS check | medium | — |
| `3.8.8` | MP | `evidence` | MET | evidence (register) + ESP inheritance for some | Media disposition register + portable-storage OS check | medium | — |
| `3.8.9` | MP | `evidence` | MET | evidence (register) + ESP inheritance for some | Media disposition register + portable-storage OS check | medium | — |
| `3.9.1` | PS | `evidence` | MET | evidence (register) — ISSO-weekly capture | Personnel-screening register populated by HR | medium | Manageable via register; full automation requires HR-system integration. |
| `3.9.2` | PS | `evidence` | MET | evidence (register) — ISSO-weekly capture | Personnel-action register + Entra account-disable telemetry | small | Termination-action timestamp from Entra audit logs feeds register. |
| `3.10.1` | PE | `esp_inheritance` | MET | esp_inheritance (Azure datacenter) | Azure FedRAMP High | wired | — |
| `3.10.2` | PE | `esp_inheritance` | MET | esp_inheritance (Azure datacenter) | Azure FedRAMP High | wired | — |
| `3.10.3` | PE | `esp_inheritance` | MET | esp_inheritance + customer attestation | Azure FedRAMP High + signed customer attestation | small | Visitor records: datacenter inherited; customer attests no on-site visitors with CUI |
| `3.10.4` | PE | `esp_inheritance` | MET | esp_inheritance (Azure datacenter) | Azure FedRAMP High | wired | — |
| `3.10.5` | PE | `esp_inheritance` | MET | esp_inheritance (Azure datacenter) | Azure FedRAMP High | wired | — |
| `3.10.6` | PE | `esp_inheritance` | MET | esp_inheritance + customer attestation | Azure FedRAMP High + signed customer attestation | small | Alternate work sites: customer attests no telework with CUI access |
| `3.11.1` | RA | `not_met` | NOT_MET | evidence (ra_envelope + register) | TrainOS RA wizard + risk_register | wired | RA bridge already in production; finalize triggers rescore. |
| `3.11.2` | RA | `evidence` | MET | evidence (ra_envelope) | TrainOS RA wizard → /api/risk-assessments bridge | wired | — |
| `3.11.3` | RA | `evidence` | MET | evidence (ra_envelope) | TrainOS RA wizard → /api/risk-assessments bridge | wired | — |
| `3.12.1` | CA | `not_met` | NOT_MET | evidence (ca_bundle when mirror lands) | TrainOS CA cycle bundle → Codex mirror (pending) | small | Vault already has CaAssessmentBundle; Codex mirror is one bridge endpoint away. |
| `3.12.2` | CA | `evidence` | MET | evidence (poam_entries + ca_bundle) | POA&M tracker + TrainOS CA cycle bundle | small | POA&M lifecycle already wired; CA bundle citation auto-attaches once mirror lands. |
| `3.12.3` | CA | `evidence` | MET | evidence (ois_narrative + register) | ISSO weekly review + register cadence checks | wired | Continuous monitoring already produces register evidence on cadence. |
| `3.12.4` | CA | `not_met` | NOT_MET | evidence (this SSP module) + ois_narrative | Codex SSP generator (this module) | wired | The SSP is the evidence — generator + signed versions cover [a]–[h]; verify endpoint detects drift. |
| `3.13.1` | SC | `evidence` | MET | evidence (technical) | OS validators + Azure crypto stack | wired | — |
| `3.13.2` | SC | `evidence` | MET | evidence (technical) | OS validators + Azure crypto stack | wired | — |
| `3.13.3` | SC | `evidence` | MET | evidence (technical) | OS validators + Azure crypto stack | wired | — |
| `3.13.4` | SC | `evidence` | MET | evidence (technical) | OS validators + Azure crypto stack | wired | — |
| `3.13.5` | SC | `evidence` | MET | evidence (technical) | OS validators + Azure crypto stack | wired | — |
| `3.13.6` | SC | `evidence` | MET | evidence (technical) | OS validators + Azure crypto stack | wired | — |
| `3.13.7` | SC | `not_applicable` | NA | evidence (technical) | OS validators + Azure crypto stack | wired | — |
| `3.13.8` | SC | `evidence` | MET | evidence (technical) | OS validators + Azure crypto stack | wired | — |
| `3.13.9` | SC | `evidence` | MET | evidence (technical) | OS validators + Azure crypto stack | wired | — |
| `3.13.10` | SC | `evidence` | MET | evidence (technical) | OS validators + Azure crypto stack | wired | — |
| `3.13.11` | SC | `evidence` | MET | evidence (technical) | OS validators + Azure crypto stack | wired | — |
| `3.13.12` | SC | `not_applicable` | NA | evidence (technical) | OS validators + Azure crypto stack | wired | — |
| `3.13.13` | SC | `evidence` | MET | evidence (technical) | OS validators + Azure crypto stack | wired | — |
| `3.13.14` | SC | `not_applicable` | NA | evidence (technical) | OS validators + Azure crypto stack | wired | — |
| `3.13.15` | SC | `evidence` | MET | evidence (technical) | OS validators + Azure crypto stack | wired | — |
| `3.13.16` | SC | `evidence` | MET | evidence (technical) | OS validators + Azure crypto stack | wired | — |
| `3.14.1` | SI | `evidence` | MET | evidence (technical + register) | Vault vuln remediation register + Defender alerts | wired | — |
| `3.14.2` | SI | `evidence` | MET | evidence (technical + register) | Vault vuln remediation register + Defender alerts | wired | — |
| `3.14.3` | SI | `evidence` | MET | evidence (technical + register) | Vault vuln remediation register + Defender alerts | wired | — |
| `3.14.4` | SI | `evidence` | MET | evidence (technical + register) | Vault vuln remediation register + Defender alerts | wired | — |
| `3.14.5` | SI | `evidence` | MET | evidence (technical + register) | Vault vuln remediation register + Defender alerts | wired | — |
| `3.14.6` | SI | `evidence` | MET | evidence (technical + register) | Vault vuln remediation register + Defender alerts | wired | — |
| `3.14.7` | SI | `evidence` | MET | evidence (technical + register) | Vault vuln remediation register + Defender alerts | wired | — |

## How to read this

**Today's met_via** is what the canonical helper currently records for the control's MET-elevator path (one of: `evidence`, `esp_inheritance`, `enduring_exception`, `dod_cio_adjudication`, `operational_plan_of_action`, `not_met`, `not_applicable`). `evidence` means at least one operational-evidence lane (technical / register / artifact / attestation) is satisfied. The other elevators correspond to the four AG p.10–11-recognized MET paths.

**Achievable path** describes the strongest lane the control *could* land on with existing or adjacent pipelines. Where the family heuristic doesn't fit a specific control, a per-control override is recorded above (e.g., wireless controls in a CUI enclave with no wireless infrastructure are declared N/A).

**Effort categories**:
- **wired**: existing pipeline already produces (or is configured to produce) the recommended evidence; no work required beyond rescore.
- **small**: a single bridge endpoint, register provisioning, or operator declaration would unlock the elevation.
- **medium**: process changes, integration work, or sustained ISSO-weekly involvement.
- **large**: HR-system integration or similar platform-spanning work; feasible but expensive.
- **blocker**: no automatable path identified — the SSP narrative + manual evidence-collection remain the only option.

**Rationale** is supplied where the override or the effort classification benefits from a one-line explanation.

---
_Generated by `src/scripts/phase-d-audit.ts`. Re-run on demand; the audit is read-only and idempotent._
