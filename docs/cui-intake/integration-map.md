# CUI Intake Integration Map

## Auth and RBAC Integration

- Session/org role enforcement: `src/lib/auth.ts`
- Page-level role redirects: `src/lib/role-gate.ts`
- EnclaveWatch bearer/session resolution: `src/lib/auth-bearer.ts`
- Middleware public-route behavior for machine ingest: `src/middleware.ts`

## Data Model Integration

- New intake schema: `src/db/schema.ts` (`intake_*` tables and enums)
- Migration: `drizzle/0078_cui_intake_registry.sql`

## API Integration

- Intake lifecycle API: `src/app/api/intake/*`
- Transaction reconstruction API: `src/app/api/intake/transaction/[intakeTransactionId]/reconstruct/route.ts`
- EnclaveWatch intake event feed: `src/app/api/enclavewatch/intake-events/ingest/route.ts`
- SSP intake language API: `src/app/api/ssp/intake-language/route.ts`

### EnclaveWatch -> Codex Intake Metadata Contract (v1)

Codex accepts only metadata-only payloads on:
- `POST /api/enclavewatch/intake-events/ingest`

Required fields:
- `event_id` (UUID)
- `event_type` (`intake_upload_authorization` | `intake_upload_started` | `intake_upload_completed` | `intake_rejected` | `intake_expired` | `intake_replay_blocked`)
- `transaction_id`
- `correlation_id`
- `policy_version`

Required policy assertions:
- `boundary_assertion = "metadata_only"`
- `upload_destination = "azure_blob_direct"`
- `source_system = "enclavewatch"`

Pre-upload gate behavior:
- EnclaveWatch must submit `intake_upload_authorization` and receive `{"ok": true, "ack": "preflight_recorded"}` before any browser upload begins.
- If Codex returns non-2xx, EnclaveWatch UI must fail closed and block upload.

Completion behavior:
- `intake_upload_completed` must carry metadata-only integrity fields:
  - `content_hash_sha256`
  - `size_bytes`
  - `upload_completed_at_utc`
  - optional `malware_scan_status`

Idempotency + replay controls:
- Primary idempotency key: `event_id`.
- Secondary idempotency key: (`transaction_id`, `event_type`, timestamp bucket).
- Token replay attempts are rejected and produce `intake_replay_blocked` evidence rows.

Rejected payload classes:
- Any key/value indicating raw filename/path/SAS token/raw bytes/plaintext CUI.
- Unknown schema keys.
- Out-of-sequence upload events (missing preflight metadata event).

Backward-compat ingest normalization:
- Legacy camelCase keys are normalized to canonical snake_case prior to strict validation.
- Legacy event aliases are normalized to canonical event types:
  - `intake_upload_initiated` -> `intake_upload_started`
  - `intake_upload_finished` -> `intake_upload_completed`
  - `intake_upload_authorized` / `intake_preflight_recorded` -> `intake_upload_authorization`
  - `intake_upload_rejected` -> `intake_rejected`
  - `intake_token_expired` -> `intake_expired`
  - `intake_token_replay_blocked` -> `intake_replay_blocked`

## Evidence and SSP Integration

- Manifest and artifact generation helpers: `src/lib/intake/manifest.ts`, `src/lib/intake/service.ts`
- Evidence/control mapping references are persisted in `intake_evidence_artifacts` and `intake_control_mappings`.
- SSP/cross-control language package: `docs/cui-intake/CUI_Intake_Implementation_Package.md`

## UI Integration

- Intake dashboard: `src/app/dashboard/intake/page.tsx`
- Intake create flow: `src/app/dashboard/intake/new/*`
- Intake detail workflow and actions: `src/app/dashboard/intake/[id]/*`
- Sidebar navigation entry: `src/components/Sidebar.tsx`

## Infrastructure Integration

- Azure Gov Bicep baseline: `infra/azure-gov/intake/*`

## Logging/Redaction Guardrails

- Token material persisted as hash references where provided.
- Blob URL values are redacted before storage.
- EnclaveWatch intake ingest rejects forbidden raw-content key paths.
- Intake event decisions are audit logged (`accepted`, `rejected`, `replay_blocked`) with correlation IDs.

## Resend Template Integration Requirements (EnclaveWatch-Owned)

The intake issuance email template must include:
- One-time token.
- Upload portal URL.
- Token expiry timestamp (UTC).
- Warning text: do not email CUI.
- Engagement/transaction reference.

Template should not include:
- Raw filename/path hints.
- SAS URLs/tokens.
- Any plaintext CUI excerpts.
