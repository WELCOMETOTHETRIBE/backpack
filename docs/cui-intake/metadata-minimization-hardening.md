# CUI Intake Metadata Minimization Hardening

## Objective

Reduce Codex/Railway metadata exposure by ensuring intake workflows avoid storing raw controlled filenames and paths wherever practical, while preserving reconstructability through aliases and hashes.

## Updated Schema Guidance

`intake_files` now supports tokenized metadata handling:

- `original_filename`:
  - should store an internal alias (for example `INTAKEOBJ-...`), not raw sender filename.
- `original_filename_hash`:
  - SHA-256 hash of the original sender filename (for correlation without plaintext storage).
- `sensitive_filename_retained`:
  - `false` by default; if `true`, treated as boundary-sensitive metadata exception.
- `blob_path`:
  - should store a redacted path reference (for example `redacted://blob/...`).
- `blob_path_hash`:
  - SHA-256 hash of the original blob path.
- `vault_destination_path`:
  - should store a redacted vault reference (`redacted://vault/...`) in Codex.
- `vault_destination_path_hash`:
  - SHA-256 hash of original vault destination path.

## Migration Strategy

Migration file: `drizzle/0079_intake_metadata_minimization.sql`

Actions:

1. Adds new hash and metadata-retention columns to `intake_files`.
2. Adds hash format checks and indexes.
3. Backfills existing rows:
   - computes hash columns from existing raw values.
   - replaces legacy `original_filename` and path columns with tokenized/redacted values.

Operational sequence:

1. Apply migration.
2. Deploy route hardening.
3. Verify new writes are alias/hash based.
4. Confirm reconstruction endpoint returns redacted/tokenized references only.

## SSP Metadata-Handling Update

Codex stores metadata-only intake records and avoids plaintext CUI payload storage. Intake file references in Codex are tokenized aliases and hash references by default. Raw filename and path context are treated as sensitive metadata and should remain enclave-resident unless explicitly approved.

Manifest generation and reconstruction outputs are redacted/tokenized and include hash references for correlation. EnclaveWatch intake ingest rejects raw filename/path keys unless the architecture is explicitly revised and documented as in-boundary.

## Redaction and Exposure Controls

- API reconstruction output: redacted/tokenized by default.
- Intake manifest content: tokenized aliases/hashes; no raw filename/path fields.
- EnclaveWatch intake ingest: rejects `original_filename`, `filename`, `blob_path`, `vault_destination_path`.
- Status/audit details: avoid logging raw names/paths.

## Residual Risk Notes

1. **Alias linkage inference risk**:
   - Internal aliases and hashes remain sensitive metadata and can support correlation if combined with external records.
2. **Operational exception risk**:
   - If `sensitive_filename_retained=true` is ever allowed, boundary scope and SSP language must explicitly account for that metadata as controlled/sensitive context.
3. **External system echo risk**:
   - Upstream senders or enclave automation may still include sensitive labels; ingest contracts must enforce tokenized payloads.

## Validation Checklist

- [ ] Raw filename not stored in `intake_files.original_filename` for new records.
- [ ] `original_filename_hash` populated for new records.
- [ ] `blob_path` and `vault_destination_path` are redacted references.
- [ ] Hash columns populated for path fields when available.
- [ ] Reconstruction endpoint excludes raw names/paths.
- [ ] Manifest output excludes raw names/paths and remains deterministic.
