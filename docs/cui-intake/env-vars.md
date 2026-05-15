# CUI Intake Environment Variables and Secrets

These variables support metadata-only intake workflows in Codex. Plaintext CUI storage paths remain outside Codex.

## Application Variables

- `INTAKE_FEATURE_ENABLED`
  - `true|false` gate for intake UI/API exposure.
- `INTAKE_DEFAULT_RETENTION_DAYS`
  - Default metadata retention horizon for intake records.
- `INTAKE_MANIFEST_STORAGE_PREFIX`
  - Prefix used for manifest artifact pointers (metadata only), for example `vault://evidence/intake`.
- `INTAKE_REQUIRE_REVIEWER_APPROVAL`
  - When `true`, closure requires reviewer approval event.
- `INTAKE_RECIPIENT_EMAIL_HASH_PEPPER`
  - Required secret used for deterministic recipient email hashing in intake metadata events (`sha256(pepper:normalized_email)`).
  - Must be managed as a secret and rotated through approved change control.

## Existing Required Integration Variables

- `DATABASE_URL` for Codex persistence.
- Existing auth/session variables used by `requireOrg` and `requireRole`.
- Existing EnclaveWatch bearer token model (`organizations.enclavewatch_api_token`) for machine metadata ingest routes.

## Secret Handling Rules

- Never persist raw SAS tokens in DB or logs.
- If token material is provided for issuance correlation, store hash-only references.
- Recipient email values from external systems must be hashed before persistence.
- Redact query strings from blob URLs before persistence.
- Do not write file payloads or plaintext CUI to audit log metadata.
