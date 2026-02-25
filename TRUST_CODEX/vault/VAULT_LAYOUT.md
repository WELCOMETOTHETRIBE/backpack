# Evidence Vault Layout (encrypted fileshare)

This document defines the **canonical evidence vault layout** for the CUI Enclave pilot.

Vault root (default): `\\EvidenceVault\CUI-Enclave`

## Design goals

- **Fast assessor handoff**: per-control bundles in a predictable location
- **Append-only**: new runs write new RunIds; do not edit prior RunIds in place
- **Run-centric provenance** + **control-centric retrieval**

## Directory structure

### Runs (raw artifacts, immutable provenance)

```
\\EvidenceVault\CUI-Enclave\runs\<RunId>\
  run.json
  raw\
    CUI-Evidence-<RunId>\...
    CUI-Evidence-<RunId>.zip
    CUI-Validation-<RunId>\...
    CUI-Azure-<RunId>\...
    CUI-Azure-Inheritance-<RunId>\...
    CUI-SRM-Ack-<RunId>\...
```

Notes:

- `<RunId>` format is `yyyyMMdd-HHmmss` (matches Codex scripts).
- `run.json` is a small manifest describing what was synced and when.

### Controls (assessor-ready bundles)

```
\\EvidenceVault\CUI-Enclave\controls\<ControlId>\<RunId>\bundle.zip
```

Each `bundle.zip` should contain:

- `README.md` (how this bundle satisfies the control)
- `artifacts/` (raw evidence artifacts relevant to the control)
- `validation/` (validator slice: control_results + relevant checks)
- `integrity/` (hash manifests, optional signatures)

### Governance (Class B records)

```
\\EvidenceVault\CUI-Enclave\governance\<ControlId>\<YYYY>\...
```

Required records, templates, cadence, and bundle paths for each Class B control are defined in **`TRUST_CODEX/tables/CLASS_B_EVIDENCE_OPERATIONS.md`**.

### Provider (inherited evidence)

```
\\EvidenceVault\CUI-Enclave\provider\azure\<ControlId>\<YYYY>\...
```

## Tooling

- Sync run artifacts into the vault:
  - `TRUST_CODEX/vault/Sync-EvidenceToVault.ps1`
- Package per-control bundles (from a run):
  - `TRUST_CODEX/tools/package_control_evidence.py`

## References

- **Evidence runbook** (exact commands for VM evidence, Entra sign-in logs, role assignments, NSG): `TRUST_CODEX/docs/EVIDENCE_RUNBOOK.md`
- **Class B operations** (required records, templates, cadence, bundle paths): `TRUST_CODEX/tables/CLASS_B_EVIDENCE_OPERATIONS.md`
- **Technical gaps and validator alignment** (RDP redirection, inactivity timeout, claim-vs-validator rule): `TRUST_CODEX/docs/TECHNICAL_GAPS_AND_VALIDATOR_ALIGNMENT.md`

