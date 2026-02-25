# CMMC Governing Records Bundle — QMS Ingest

This folder is the **CMMC Governing Records** bundle for ingest into your Quality Management System (QMS) as controlled documents. After approval and sign-off in the QMS, push the signed versions to the CUI vault and other endpoints.

## Contents

- **`qms-ingest-manifest.json`** — Manifest for QMS import. Lists every document with `code`, `title`, `kind`, `path`, and `qms_doc_type`. Use this to create controlled document records and attach the files.
- **`docs/`** — All governing documents in the same structure as the source (01-system-scope, 02-policies-and-procedures, 04-self-assessment, 05-evidence, 06-supporting-documents, tables). Populated by the build script.

## Build (refresh `docs/`)

From the TRUST_CODEX root:

```bash
python tools/build_cmmc_qms_bundle.py
```

Optional: create a zip for export:

```bash
python tools/build_cmmc_qms_bundle.py --zip
```

This produces `CMMC_Governing_Records_YYYYMMDD.zip` in this folder.

## QMS Ingest Workflow

1. **Import the manifest**  
   Load `qms-ingest-manifest.json` into your QMS (or use it as a checklist). Each `documents[]` entry has:
   - `code` — Document ID (e.g. MAC-POL-210)
   - `title` — Display title
   - `kind` — plan | policy | procedure | form | guide | template | record | assessment | scope | reference
   - `path` — Path relative to this bundle (e.g. `docs/02-policies-and-procedures/MAC-POL-210_Access_Control_Policy.md`)
   - `qms_doc_type` — Suggested QMS type (e.g. "Controlled Document - Policy")
   - `review_cadence` — Optional (e.g. annual, monthly)

2. **Upload files**  
   For each document, upload the file at `path` and link it to the corresponding controlled document record in the QMS.

3. **Review and sign**  
   Complete review and approval/sign-off in the QMS per your document control process.

4. **Push to endpoints**  
   Export the approved/signed versions from the QMS and distribute to:
   - CUI vault (governance bundle for the app)
   - Other endpoints (e.g. enclave VM, manual app, evidence store)

## Forward Workflow

Going forward: **create and revise documents in the QMS first**, then push signed versions out to:

- CUI vault (as the authoritative governance bundle)
- Other endpoints for governance record-keeping

This bundle is the initial set to load into the QMS; afterward, the QMS is the source of truth and this repo (or export from QMS) is used to sync endpoints.

## Reference

- Master list of required docs: `TRUST_CODEX/tables/C3PAO_CMMC_L2_Required_Documents_and_Records.md`
- Inventory and mapping: `TRUST_CODEX/tables/C3PAO_Governance_Inventory_and_Mapping.md`
- Full C3PAO bundle manifest (for app ingestion): `TRUST_CODEX/C3PAO_Bundle_Manifest.json`
