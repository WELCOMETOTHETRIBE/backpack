# CUI Intake Rollout and Rollback

## Rollout Strategy

1. Deploy DB migration `0078_cui_intake_registry.sql`.
2. Deploy API and service layer (`src/app/api/intake/*`, `src/lib/intake/*`).
3. Deploy dashboard routes and sidebar navigation.
4. Deploy Azure Gov intake baseline from `infra/azure-gov/intake`.
5. Enable operational SOP usage for selected pilot projects.
6. Validate end-to-end transaction reconstruction before broad rollout.

## Feature Exposure Controls

- Restrict create/provision actions to `Admin` and `Compliance`.
- Restrict reviewer actions to `Admin`, `Compliance`, `Assessor`.
- Keep machine ingest to bearer/session-resolved org context only.

## Verification Gates

- Can create intake request with deterministic transaction id.
- Can complete at least one full chain: provision -> upload register -> scan -> hash -> import -> review -> revoke -> manifest -> close.
- No plaintext CUI content in intake tables or API responses.
- Azure baseline checks pass (`verify-baseline.sh`).

## Rollback

### Application rollback

- Revert deployment to previous release image.
- Temporarily disable sidebar access by reverting nav entry if needed.
- Continue manual intake process with SOP controls until fixed.

### Data rollback

- Preserve created intake rows for audit; do not hard-delete lifecycle records.
- Mark failed or reverted transactions as `Exception` and attach corrective notes.

### Infrastructure rollback

- Revert Bicep deployment to prior known-good template/parameters.
- If private endpoint causes disruption, remove PE while keeping restrictive ACLs.

## Hard Stop Criteria

- Any observed plaintext CUI stored in Codex intake metadata tables.
- Inability to revoke sender access within required SLA.
- Manifest hash generation mismatch for canonical payload.
- Cross-tenant access leakage detected in endpoint authorization tests.
