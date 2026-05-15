# C3PAO Defensibility - Intake Metadata Event Chain

## Scope

This document maps technical controls and evidence artifacts for the Codex intake metadata workflow where file bytes are uploaded directly from browser to Azure Blob and Codex stores metadata only.

Primary register:
- `intake_metadata_events` in `src/db/schema.ts`

Primary ingest boundary:
- `POST /api/enclavewatch/intake-events/ingest`

## Control-to-Evidence Mapping

| Control Objective | Technical Control | Evidence Artifact | Test Evidence |
| --- | --- | --- | --- |
| Metadata-only boundary enforced | Strict schema + forbidden-key/value scanner at ingest boundary (`src/lib/intake/event-validators.ts`) | Rejected ingest audit logs + no prohibited fields in `intake_metadata_events` | `src/lib/intake/__tests__/event-validators.test.ts`, `src/app/api/enclavewatch/intake-events/ingest/route.test.ts` |
| Pre-upload metadata capture occurs before upload | `intake_upload_started` and `intake_upload_completed` require prior accepted `intake_upload_authorization` event | Event sequence in `intake_metadata_events` by `transaction_id` and `event_timestamp_utc` | `src/lib/intake/__tests__/event-ingest.test.ts` |
| Replay protection | Idempotency by `event_id` and replay-bucket key + token replay rejection with `intake_replay_blocked` row | `intake_metadata_events` decision/status records + replay-blocked audit event | `src/lib/intake/__tests__/event-ingest.test.ts` |
| Integrity metadata captured on completion | Completion requires metadata-only integrity fields (`content_hash_sha256`, `size_bytes`, `upload_completed_at_utc`) | `intake_metadata_events` completion row | `src/lib/intake/__tests__/event-ingest.test.ts` |
| Assessor-readable chain-of-custody | Correlation and transaction IDs propagated across events and exposed by reconstruction route | `GET /api/intake/transaction/{id}/reconstruct` output includes lifecycle metadata events | `src/app/api/intake/transaction/[intakeTransactionId]/reconstruct/route.test.ts` |

## Example Transaction Timeline

Transaction: `INTAKE-ACME-PROJ-20260514-0001`  
Correlation: `corr-6f4c4a51`  
Policy: `v1`

1) `intake_upload_authorization`
- status: `preflight_recorded`
- decision: `accepted`
- event timestamp: `2026-05-14T10:00:00Z`
- key metadata: `token_id`, `token_expires_at_utc`, `recipient_email_hash`, `object_reference_token`
- expected ack: `preflight_recorded`

2) `intake_upload_started`
- status: `upload_started`
- decision: `accepted`
- event timestamp: `2026-05-14T10:00:08Z`
- precondition enforced: prior accepted preflight event exists

3) `intake_upload_completed`
- status: `upload_completed`
- decision: `accepted`
- event timestamp: `2026-05-14T10:00:55Z`
- integrity metadata: `content_hash_sha256`, `size_bytes`, `upload_completed_at_utc`, optional `malware_scan_status`

4) Replay attempt (blocked)
- emitted event type: `intake_replay_blocked`
- status: `replay_blocked`
- decision: `rejected`
- reason: token previously consumed
- expected response: HTTP 409 with `reason_code = replay_blocked`

## Assessor Query Hints

- Lifecycle by transaction:
  - filter `intake_metadata_events` on `transaction_id`
  - order by `event_timestamp_utc`, then `created_at`
- Replay evidence:
  - filter `status = 'replay_blocked'` or `decision = 'rejected'`
- Boundary compliance:
  - validate `boundary_assertion = 'metadata_only'`
  - validate `upload_destination = 'azure_blob_direct'`
  - validate no prohibited key classes in accepted payloads
