# CUI/FCI Intake Capability Package (Metadata-Only Codex)

This package documents implemented architecture, boundary decisions, workflows, evidence expectations, and deployment artifacts for a controlled and auditable CUI/FCI intake lifecycle.

## Track 1 - Architect Review and Boundary Decisions

### Boundary Findings

- Codex/control-plane remains metadata-only for intake records.
- Plaintext CUI is constrained to Azure Gov intake storage and the Windows CUI Vault boundary.
- EnclaveWatch ingestion remains metadata-only and explicitly rejects raw content keys.
- Intake lifecycle is transaction-centered and reconstructable by `intake_transaction_id`.

### In-Scope Components

- Azure Government intake storage account + scoped containers/paths
- Defender for Storage scan telemetry
- Windows Server CUI Vault import endpoint/process
- Vault evidence storage path for canonical manifest and package outputs
- Codex metadata registry (intake requests, files, review actions, manifests, evidence references)

### Out-of-Scope Components for Plaintext CUI

- Codex relational database content
- Codex generic artifact upload stores for intake workflow
- EnclaveWatch metadata ingestion payloads

### Metadata vs Plaintext CUI Flow

- Plaintext CUI flow: sender -> Azure intake container -> private import to vault.
- Metadata flow: intake events, hash values, status changes, manifest references, reviewer attestations -> Codex and EnclaveWatch.
- Evidence flow: manifest hash, artifact pointers, control mappings, review records -> Codex evidence/SSP views.

### Risk Decisions

- Entra B2B access is preferred and time-scoped.
- User delegation SAS is fallback only, upload-only, short-lived.
- Shared key access and account SAS are disallowed by default.
- Metadata-only codex posture is enforced by schema/content design and route validation.

### CMMC Control Mapping (High-Level)

- AC/IA: scoped sender authorization and revocation trail
- AU/CA: event logging, manifest hashing, assessor walkthrough evidence
- MP/SC: controlled media locations and protected transfer channel
- SI/IR: malware/quarantine/exception handling
- CM/RA: baseline checks and risk handling in closure workflows

### SSP-Ready Language

The system employs a controlled intake architecture in which external files are received through an Azure Government intake storage account scoped per client/project transaction. Intake artifacts are assigned deterministic transaction identifiers, scanned and hash-correlated, and then imported to a protected Windows Server CUI Vault via controlled pathing. The Codex control-plane stores metadata-only intake records and evidence references, and does not ingest plaintext CUI unless separately approved and engineered as an in-boundary component.

Each intake transaction captures sender identity data, authorization basis, upload method, file metadata, malware status, SHA-256 hash, vault import correlation, reviewer attestation, access revocation timestamp, and evidence manifest hash. This produces a reconstructable chain-of-custody record suitable for C3PAO examination when operated per SOP and boundary documentation.

Prohibited methods include regular email transfer of CUI, anonymous/public upload endpoints, broad or long-lived SAS grants, and direct public upload services on the vault host.

### Assessor-Facing Rationale

- Single intake transaction identifier anchors all lifecycle records.
- Manifest canonicalization + hash gives tamper-evident chain anchor.
- Revocation and closure are explicitly modeled and auditable.
- Evidence package and control mappings are generated from lifecycle events.
- Boundary language and implementation artifacts are aligned to avoid overclaim.

### Open Questions

- Which upstream service will be system-of-record for B2B invitation lifecycle events?
- Which enclave-side process computes authoritative file hash (upload-time vs pre-import vs post-import)?
- Is immutable blob policy required for all evidence artifacts or only final manifests?
- Should vault import attestation require dual-signoff for specific customer tiers?

## Track 2 - Engineer Build Plan and Implementation Slices

### A. Recommended Target Architecture

- API + DB module: `src/app/api/intake/*` + `src/lib/intake/*` + `src/db/schema.ts`
- Dashboard UX: `src/app/dashboard/intake/*` + sidebar integration
- Azure IaC: `infra/azure-gov/intake/*`
- EnclaveWatch metadata ingestion: `src/app/api/enclavewatch/intake-events/ingest/route.ts`

### B. ASCII Data Flow Diagram

```text
External Sender
  -> (B2B preferred / UDS SAS fallback)
Azure Gov Intake Blob Scope
  -> upload event -> metadata record
  -> scan status -> hash capture -> manifest generation
Windows CUI Vault Import
  -> import status -> path correlation -> reviewer attestation
Codex Metadata Registry
  -> evidence artifacts -> control mappings -> SSP/SCTM references
EnclaveWatch Metadata Stream
  -> intake event telemetry and anomalies (metadata only)
```

### C. Database Schema Plan (Implemented)

New tables:

- `intake_requests`
- `intake_files`
- `intake_access_grants`
- `intake_review_actions`
- `intake_manifests`
- `intake_evidence_artifacts`
- `intake_exceptions`
- `intake_control_mappings`

Added enums:

- `intake_expected_classification`
- `intake_status`
- `intake_access_method`
- `intake_malware_scan_status`
- `intake_vault_import_status`
- `intake_disposition`

Migration:

- `drizzle/0078_cui_intake_registry.sql`

### D. API / Backend Plan (Implemented Endpoints)

- `POST /api/intake` create intake request
- `GET /api/intake` list requests
- `GET /api/intake/[id]` detail with lifecycle linked records
- `PATCH /api/intake/[id]` status transition
- `POST /api/intake/[id]/provision-upload-scope`
- `POST /api/intake/[id]/register-upload`
- `POST /api/intake/[id]/scan-status`
- `POST /api/intake/[id]/generate-hash`
- `POST /api/intake/[id]/record-vault-import`
- `POST /api/intake/[id]/reviewer-action`
- `POST /api/intake/[id]/revoke-access`
- `POST /api/intake/[id]/generate-manifest`
- `POST /api/intake/[id]/generate-evidence-package`
- `POST /api/intake/[id]/exception`
- `POST /api/intake/[id]/close`
- `GET /api/intake/transaction/{intake_transaction_id}/reconstruct`
- `POST /api/enclavewatch/intake-events/ingest`

### E. Admin UI Plan (Implemented Baseline)

- `GET /dashboard/intake` intake dashboard table
- `GET /dashboard/intake/new` create request workflow
- `GET /dashboard/intake/[id]` detail view with workflow actions
- Sidebar navigation entry for intake module

### F. Azure Infrastructure Plan (Implemented Artifacts)

- `infra/azure-gov/intake/main.bicep`
- `infra/azure-gov/intake/modules/storage-intake.bicep`
- `infra/azure-gov/intake/modules/diagnostics.bicep`
- `infra/azure-gov/intake/parameters/example.usgovvirginia.bicepparam`
- `infra/azure-gov/intake/deploy.sh`
- `infra/azure-gov/intake/verify-baseline.sh`

### G. Intake Accountability Matrix

| Intake Event Type | Logged Metadata | Evidence Artifact | Retention Requirement | Boundary Location | Responsible Role | Associated CMMC Controls | Immutable/Non-Immutable | Source of Truth | Notes / Risks if Omitted |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Request Created | tx_id, org/project/client refs, sender, classification, auth basis | intake request row | Per contract + policy | Codex metadata | Compliance | AC, AU | Non-immutable | `intake_requests` | Loss of traceability from origin |
| Upload Scope Provisioned | access method/scope, expiry, token hash ref | access grant row | Per access policy | Codex metadata + Azure RBAC | Compliance/Admin | AC, IA, SC | Non-immutable | `intake_access_grants` | Inability to prove least privilege |
| Upload Registered | filename, size, container/path redacted, uploader identity | intake file row | Per intake retention | Codex metadata | Intake operator | AU, MP | Non-immutable | `intake_files` | Missing ingress evidence |
| Scan Captured | malware status, timestamp, scan ref | scan metadata | Security log retention | Codex metadata + Defender logs | Security ops | SI, IR, AU | Non-immutable | `intake_files` + Defender logs | Malicious file handling gap |
| Hash Generated | sha256, hash actor/time | hash record | Long-term for custody | Codex metadata + vault | Intake operator | AU, MP | Non-immutable | `intake_files` | Weak chain-of-custody |
| Vault Import Recorded | destination path, importer, timestamp | import record | Long-term for custody | Vault + Codex metadata | Vault operator | AC, MP, SC | Non-immutable | `intake_files` | No source-to-vault proof |
| Reviewer Approval | reviewer action + notes + timestamp | review action row | Assessment cycle | Codex metadata | Reviewer/Assessor | CA, AU | Non-immutable | `intake_review_actions` | Weak attestation trail |
| Access Revoked | revoke timestamp | revocation event | Access audit retention | Codex metadata + Entra logs | Admin | AC, IA, AU | Non-immutable | `intake_access_grants` | Lingering exposure risk |
| Manifest Generated | canonical json + manifest hash | manifest row | Long-term | Vault evidence + Codex hash reference | Compliance | AU, CA | Immutable/hashable | `intake_manifests` | Harder reconstruction |
| Evidence Package Generated | package pointer + hash + mapping refs | evidence artifact row | Long-term | Vault evidence + Codex metadata | Compliance | AU, CA | Immutable/hashable preferred | `intake_evidence_artifacts` | C3PAO walkthrough friction |

### H. CMMC Evidence Matrix

| Control Family | Relevant Control Intent | Intake Design Feature | Evidence Artifact | Frequency/Cadence | Owner | Source of Truth | Technical/Procedural/Inherited/Shared | C3PAO Review Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AC | Scope and limit access | Project-scoped grants + revocation | access grants + revocation timestamps | Per intake | Compliance/Admin | `intake_access_grants` | Technical + Procedural | Show least privilege and expiry |
| AU | Generate and preserve audit trails | Lifecycle events + manifest hash | request/file/review/manifest records | Per event | Compliance | intake tables + audit logs | Technical | Reconstruct by tx ID |
| IA | Verify sender identity | B2B preferred, identity method fields | sender identity metadata | Per intake | Intake operator | `intake_requests` | Shared + Procedural | Explain fallback SAS constraints |
| MP | Protect media handling | Controlled intake + vault import tracking | file metadata + disposition | Per file | Vault operator | `intake_files` | Technical + Procedural | Demonstrate controlled destinations |
| SC | Protect transfer channels | TLS + storage baseline + private import option | Bicep + verification output | Deployment + periodic | Platform | IaC + cloud config | Inherited + Technical | Show denied anonymous/public paths |
| SI | Detect malicious code | scan status capture + quarantine branch | malware status fields | Per upload | Security ops | `intake_files` + Defender | Shared + Technical | Show handling for failed scan |
| CM | Baseline control of intake infra | Bicep-defined baseline | IaC templates + baseline check output | On change | Platform | `infra/azure-gov/intake` | Technical | Show config drift process |
| IR | Exception/quarantine handling | explicit exception workflow | intake exceptions + POA&M refs | Per exception | Security/Compliance | `intake_exceptions` | Technical + Procedural | Show escalation path |
| RA | Intake risk handling | exception + risk notes in closure | exception records + mappings | Per event | Compliance | intake exception/mapping tables | Procedural + Technical | Show risk decisions rationale |
| CA | Assessor evidence readiness | evidence package + control mappings | evidence artifacts + control mappings | Per intake closeout | Compliance | intake artifact/mapping tables | Technical + Procedural | Walk through one sample tx end-to-end |

### I. SSP Language

The organization implements a controlled intake subsystem for external CUI/FCI ingress. Intake requests are authorized and scoped by organization/client/project context and receive deterministic intake transaction identifiers. External senders use approved transfer methods (Entra B2B preferred, short-lived user delegation SAS fallback) limited to project-specific intake paths in Azure Government storage.

The system records upload metadata, malware scan status, file hash values, and vault import correlation records. A reviewer attests to intake completion and access revocation. Final intake manifests are canonicalized and hash-linked to evidence artifacts. Codex stores metadata and evidence references only; plaintext CUI remains in approved intake and vault storage components.

SSP-ready intake narrative output is exposed at `GET /api/ssp/intake-language` for boundary/component sections.

Metadata minimization hardening for filename/path tokenization and residual risk handling is documented in `docs/cui-intake/metadata-minimization-hardening.md`.

### Intake Metadata Event Register Addendum

To support C3PAO walkthroughs for EnclaveWatch-mediated upload flows, Codex now records lifecycle metadata events in `intake_metadata_events` with strict metadata-only contract enforcement. The event chain captures:

- pre-upload authorization metadata acknowledgment,
- upload start/completion metadata (without file bytes),
- replay-blocked and rejected decisions with reasons,
- correlation and policy version continuity from issuance through completion.

This supports explicit proof that metadata capture occurred before browser upload progression and that rejected/replay conditions are auditable.

Reference materials:
- Integration contract: `docs/cui-intake/integration-map.md`
- Defensibility mapping and example lifecycle timeline: `docs/cui-intake/c3pao-defensibility-intake-metadata.md`

### J. Operational SOP

#### Staff SOP

1. Create intake request and verify contract/project authorization basis.
2. Confirm expected classification and sender identity verification method.
3. Provision upload scope (B2B preferred, SAS fallback if documented exception).
4. Send sender instructions and expiry window.
5. Monitor upload metadata and verify scan status.
6. Generate or validate SHA-256 hash and record provenance.
7. Perform controlled import into vault and record destination correlation.
8. Capture reviewer action and approve/reject disposition.
9. Revoke sender access and verify no lingering grants.
10. Generate manifest + evidence package + control mappings.
11. Close transaction or record exception with POA&M linkage.

#### Sender Instructions

- Do not email CUI/FCI.
- Use only the issued upload path and expiration window.
- Upload only files for the specified project/contract.
- Preserve CUI/FCI markings and filenames as provided.
- Notify MacTech when upload is complete.
- Do not reuse expired links/tokens.
- If classification is uncertain, stop and contact MacTech security/compliance.

### K. Test Plan

#### Functional

- Create intake request with deterministic transaction ID
- Provision scope and store access grant metadata
- Register upload metadata
- Record scan status and hash
- Record vault import and reviewer action
- Revoke access and close request
- Generate manifest and evidence package

#### Security

- Anonymous access denied for protected endpoints
- Cross-org request reads/writes denied
- Invalid status transitions rejected
- Raw SAS token not persisted in cleartext
- Forbidden raw-content keys rejected in EnclaveWatch ingest
- Metadata-only behavior validated in Codex records

#### Evidence

- Complete transaction reconstruction by ID
- Manifest hash exists and is stable for same canonical payload
- Control mappings linked to evidence package
- Revocation timestamp captured before close

#### Negative

- Scan failed/quarantine paths supported
- Missing file/hash blocks closure operations
- Expired grant revocation visibility preserved
- Exception path logs reason and POA&M reference

### L. Definition of Done

- Intake lifecycle operational through UI + API
- Transaction ID generation deterministic and unique
- Metadata-only boundary preserved in implementation
- Access provisioning/revocation auditable
- Manifest/evidence package generated and hash-linked
- Control mappings present for assessor walkthrough
- Azure Gov baseline artifacts deployable and verifiable

### M. Open Questions / Required Inputs

- Approved Entra B2B tenant restrictions and MFA policy specifics
- Final retention schedule by contract/customer type
- Required immutable retention mode (policy lock/legal hold) per artifact class
- Exact vault import service identity and private networking topology
- Final list of required CMMC control IDs beyond seeded defaults
