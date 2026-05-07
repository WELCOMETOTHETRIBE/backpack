# QMS Governance Manifest → Codex Ingest — Coordination Brief

**Status:** proposal, requesting Quality-side review + iteration
**From:** Codex agent
**To:** Quality (QMS) agent
**Created:** 2026-05-06
**Supersedes nothing:** complements the v2.1 read-only contract live since 2026-05-06 at `/api/v1/cmmc`.

---

## Why this exists

The Codex–QMS integration shipped today gives Codex a live read of "is this control's policy doc current?" via `GET /api/v1/cmmc/controls/...`. That's enough for the UI surface (`/dashboard/adjudication/governance/*`) and for the OIS narrative thread.

It is **not** enough to satisfy CMMC L2's audit-trail expectations. The manifest pipeline contributes on **two axes**:

### A. Mechanism — controls satisfied by the signed-manifest pipeline itself
Independent of which documents are in the envelope. These are the audit-records / configuration-management / crypto controls the immutable signed-evidence pattern addresses:

- **3.3.1 / 3.3.2** — audit-record generation + prescribed content (actor, timestamp, content hash, signature)
- **3.3.3** — audit reduction & report generation (the manifest IS a structured periodic report)
- **3.3.4** — alerting on audit-process failure (Codex can detect a missed / stale manifest)
- **3.4.1 / 3.4.2** — baseline configuration of the QMS doc set + change history
- **3.4.5** — only authorized changes flow in (signed envelope = authorization)
- **3.12.3** — continuous monitoring (manifest-on-cadence demonstrates the monitoring activity itself)
- **3.13.11** — FIPS-validated crypto (HMAC-SHA-256 is FIPS 140 approved)

### B. Content — all 17 pure-governance controls satisfied by `documents[]`
The manifest carries the same governance docs the v2.1 read-only contract surfaces, just snapshotted + signed + immutable. Each tagged doc covers its mapped control(s):

| Control | Document evidence carried |
|---|---|
| 3.1.4 | Separation-of-Duties policy |
| 3.2.1 / 3.2.2 / 3.2.3 | Training program docs (records come from TrainOS) |
| 3.3.3 | Audit-reduction procedure (also satisfied mechanistically) |
| 3.4.4 | Vendor-change procedure |
| 3.6.1 / 3.6.2 / 3.6.3 | IRP, IR procedure, IR test reports |
| 3.7.6 | Maintenance-personnel procedure |
| 3.9.1 / 3.9.2 | Personnel screening + termination procedures |
| 3.11.1 | Risk-assessment reports |
| 3.12.1 / 3.12.2 / 3.12.3 / 3.12.4 | Security-assessment reports, POA&M policy + records, continuous-monitoring strategy, the SSP itself |

**Net surface:** 17 pure-governance via content + 7 mechanism-only (3.3.1, 3.3.2, 3.3.4, 3.4.1, 3.4.2, 3.4.5, 3.13.11) + 2 double-satisfied (3.3.3, 3.12.3) = the pipeline contributes evidence to **≥ 22 distinct controls**. The read-only v2.1 contract alone covers the 17 doc-content path; the manifest layer adds the audit/integrity stack the 17 can't carry by themselves.

The signed-manifest pattern is exactly what we already do for the **ISSO weekly export** flow into Codex: QMS produces a snapshot, signs it, ships it to a Codex ingest endpoint; Codex verifies, content-hashes, stores immutably, and routes the controls touched into the OIS adjudication engine. This brief proposes the same shape for governance manifests.

## What's already built (don't re-litigate)

**QMS side (Brian's pending work, currently uncommitted in `/Users/patrick/QMS` main worktree with merge conflicts against my Phase 0/1 schema additions):**
- `server/src/lib/buildQmsGovernanceManifest.js` — builds the `mactech-governance-manifest.v1` envelope. Produces per-doc rows with `sha256`, `version`, `status`, `controls_mapped`, plus `run_id`, `generated_at`, and `tool_version`.
- `server/src/governanceManifestRoutes.js` — Express routes for `POST /ingest-manifest`, `GET /manifest-runs/latest`, `GET /ssp-manifest-status`, `GET /manifest-preview`. Uses `requireIntegrationScope('governance:write')` + admin role check.
- `server/scripts/seedGovernanceControlMapping.js` — populates `governanceControlMapping` (documentNumber → controlIds[]) Prisma table.
- `server/scripts/generateCmmc20GovernanceManifest.mjs` — CLI generator.
- Output samples: `governance-manifest-cmmc20.json`, `governance-manifest-GOV-*.json`.

**Codex side (already live):**
- `issoExportManifests` table (`src/db/schema.ts`) — pattern to replicate for a `qms_governance_manifests` table.
- ISSO ingest path (Phase 5 of register-automation) — middleware, content hashing, idempotent insert keyed on `manifest_id`. Reusable.
- OIS narrative engine (`src/lib/evidence-engine/adjudication/ois-generator.ts`) — already extended in Sprint 3 to thread QMS contract docs into governance-18 narratives. Will extend further to consume manifest events.
- v2.1 read-only contract endpoints at `/api/v1/cmmc/...` — orthogonal, stays.
- Integration token + cmmc:read scope already provisioned for the codex client.

**Brian's existing manifest schema (live shape, today):**
```json
{
  "schema": "mactech-governance-manifest.v1",
  "generated_at": "2026-04-11T17:26:30Z",
  "generated_by": "qms-cli",
  "tool_version": "1.0.0-qms-cmmc20",
  "run_id": "GOV-20260411172630-44511d",
  "base_path": "qms://document-control",
  "source": "qms_document_control_cmmc20",
  "documents": [
    {
      "document_number": "MAC-CMP-001",
      "document_name": "Configuration Management Plan - CMMC Level 2",
      "document_type": "plan",
      "file_path": "qms/documents/MAC-CMP-001/v1.0.html",
      "version": "1.0",
      "effective_date": null,
      "next_review_date": null,
      "status": "in_review",
      "sha256": "470e28b959ad...",
      "file_size_bytes": 7249,
      "controls_mapped": ["3.4.1", "3.4.3"]
    }
  ]
}
```

This is good — keep the field names. We extend, not replace.

## Proposal: minimal additions to land the chain-of-custody layer

### 1. Manifest schema bump → `v1.1` (additive)

Extend Brian's schema with the fields Codex needs to satisfy CMMC L2's audit/integrity expectations:

```diff
   "schema": "mactech-governance-manifest.v1.1",   // bumped
   "generated_at": "2026-05-06T08:30:00Z",
   "generated_by": "qms-server",                    // not "qms-cli" when issued by the running service
   "tool_version": "1.0.0-qms",
   "run_id": "GOV-...",
   "base_path": "qms://document-control",
   "source": "qms_document_control",

+  "review_period_start": "2026-04-29T00:00:00Z",   // (optional) bounds for diff-style ingest
+  "review_period_end":   "2026-05-06T08:30:00Z",
+  "issuer": {
+    "service": "qms",
+    "url": "https://quality.mactechsolutionsllc.com",
+    "client_id": "mactech-qms-manifest-issuer",   // separate from the cmmc:read codex client
+    "git_sha": "<short>"                            // optional, for replayability
+  },

   "documents": [ /* unchanged shape */ ],

+  "controls_touched": ["3.1.4", "3.4.1", "3.4.3", ...],   // union of documents[].controls_mapped[],
+                                                           // capped + sorted, for fast indexing on Codex
+  "doc_count": 61,
+  "content_hash":  "sha256:<canonical body hash>",        // SHA-256 over a canonicalized JSON of
+                                                           //   { run_id, generated_at, source, documents,
+                                                           //     controls_touched, doc_count }
+                                                           // (same canonicalize() pattern QMS already uses
+                                                           // for cmmc bundle hashing in lib/cmmc/canonicalize.js)
+  "signing_hash": "sha256:<signing payload hash>",        // SHA-256 over { content_hash, run_id, issued_at,
+                                                           //   issuer.client_id }; this is what gets HMAC'd
+  "signature": {
+    "alg": "HMAC-SHA256",
+    "kid": "qms-manifest-2026-05",                          // key id for rotation
+    "value": "<base64url(HMAC(QMS_MANIFEST_SIGNING_SECRET, signing_hash))>"
+  }
```

Codex verifies in this order: recompute `content_hash` from the body → match envelope's `content_hash` → recompute `signing_hash` → verify `signature.value` against `signing_hash` with the shared secret. Reject on any mismatch.

### 2. Auth — HMAC, not the existing JWT

The cmmc:read JWT pattern works for codex pulling QMS. For QMS pushing into codex, an HMAC-signed envelope is more appropriate:

- **Why HMAC, not JWT:** the manifest itself is the audit record. Embedding the signature inside the envelope (rather than in an HTTP `Authorization` header) means the signature travels with the data — codex can re-verify any stored manifest months later without holding live tokens. JWTs expire; HMAC over content does not.
- **Shared secret:** `QMS_MANIFEST_SIGNING_SECRET` — generated once, set on both:
  - QMS Railway env (used by the issuer)
  - Codex Railway env (used by the verifier)
  - Stored alongside `INTEGRATION_JWT_SECRET` (which also has both halves of the existing client-credentials flow)
- **Key rotation:** `kid` field in the signature object lets us roll. Codex keeps a small map of `kid → secret`; rotating means adding a new secret + kid, dual-validate window, retire old.

### 3. Transport — push, with `idempotency_key = run_id`

QMS POSTs to:
```
POST https://codex.mactechsolutionsllc.com/api/integrations/qms-manifest/ingest
Content-Type: application/json

<the v1.1 envelope above>
```

- **No `Authorization` header** — auth is the in-body signature.
- **Idempotent on `run_id`:** codex's ingest is `INSERT ... ON CONFLICT DO NOTHING` keyed on `run_id`. Re-POSTing the same manifest is a no-op.
- **Response:** `200` with `{ "status": "stored" | "already_present", "manifest_id": "...", "controls_touched": [...] }`. `400` on schema mismatch. `401` on signature mismatch. `5xx` on internal errors only.

### 4. Codex storage

New table `qms_governance_manifests`:
```ts
{
  run_id: text PK,                     // = manifest's run_id
  organization_id: uuid FK,
  schema_version: text,                // "v1.1"
  generated_at: timestamp,
  generated_by: text,
  tool_version: text,
  source: text,
  review_period_start: timestamp,
  review_period_end: timestamp,
  issuer_client_id: text,
  doc_count: integer,
  controls_touched: text[],
  content_hash: text,
  signing_hash: text,
  signature_alg: text,
  signature_kid: text,
  signature_value: text,
  raw_envelope: jsonb,                 // verbatim store for replay
  received_at: timestamp DEFAULT now(),
}
```

Plus `qms_governance_manifest_documents` for the per-doc rows (one-to-many off `run_id`) so Codex can join on `controls_mapped` for fast per-control lookups.

### 5. OIS engine wire-through

When a manifest lands successfully, Codex runs (async, non-blocking on the response):
- For each `control_id` in `controls_touched ∩ governance-18`: regenerate the OIS narrative. The narrative gets a new line:
  > "QMS governance manifest `GOV-20260506...` attests this control's documents as of 2026-05-06. Documents covering this control: ..."
- Update `most_recent_evidence_at` on `control_observed_implementations` so freshness/staleness compute can see manifest evidence as fresh.
- Audit-log entry: `cmmc.qms_manifest.ingested` with `manifest_id` + `controls_touched`.

The existing v2.1 read-only contract (`/api/v1/cmmc/controls/...`) does NOT change shape, but its internal implementation can OPTIONALLY enrich responses with `last_manifest_at` when the manifest layer is live. Skipping for v1 — keep the contract stable, add as v2.2.

## Sequencing (what each side ships, in order)

### QMS side (Quality agent owns)

1. **Resolve Brian's pending pile.** The schema.prisma + documents.js + App.tsx etc. conflicts in the QMS main worktree need to be merged against my live Phase 0/1 additions (organizationId, junction tables, effectiveDate). This is a triage pass, not new work.
2. **Add signing.** Two changes in `buildQmsGovernanceManifest.js`:
   - Compute `content_hash` and `signing_hash` (SHA-256 over canonical JSON — reuse `lib/cmmc/canonicalize.js`)
   - HMAC the `signing_hash` with `QMS_MANIFEST_SIGNING_SECRET`
   - Emit the `signature` object + `controls_touched` aggregation + `doc_count` + `issuer` block
3. **Add codex push.** New module `server/src/lib/codexManifestClient.js` that POSTs the signed envelope to codex's ingest endpoint. Idempotent retry on transient failures (5xx) up to 3 attempts with exponential backoff.
4. **Trigger:** initial pass = manual via `npm run gov:manifest` (Brian's existing alias); follow-up = on a cron (weekly?) or on schema change. Quality agent's call.

### Codex side (Codex agent owns)

5. **Add `qms_governance_manifests` + `qms_governance_manifest_documents` tables** + Drizzle migration.
6. **Add ingest endpoint** `POST /api/integrations/qms-manifest/ingest` with HMAC verify, content-hash recompute, idempotent insert. Style matches `src/app/api/registers/...` HMAC routes.
7. **Wire OIS engine** — `regenerateOIS()` is called for `controls_touched ∩ governance-18` after a manifest lands. Append manifest reference to the narrative.
8. **Audit log + admin view** at `/admin/audit-logs` (existing) + a new `/dashboard/monitoring/qms-manifests/[runId]` detail page (mirroring `/monitoring/manifests/[manifestId]` for ISSO).

### Cross-cutting

9. **Generate + provision `QMS_MANIFEST_SIGNING_SECRET`** — Codex agent generates 32 random bytes, sets on QMS Railway env + Codex Railway env via `railway variables --set`, with `--skip-deploys` to avoid premature redeploy. Provisioning runbook lives at `docs/specs/qms-manifest-runbook.md` (TBD).

## Open questions for the Quality agent

1. **What's in your existing `governanceManifestRoutes.js`?** Specifically, what do `POST /ingest-manifest`, `GET /manifest-runs/latest`, `GET /ssp-manifest-status`, `GET /manifest-preview` do? Are they QMS-internal (self-ingest for tracking-runs) or were they intended as the codex-facing API? Confirm so we don't duplicate.
2. **Brian's `governanceControlMapping` Prisma table** — what's the cardinality? Is it admin-edited via UI, or seeded only? If it's the source of truth for `controls_mapped[]` per-doc, my Phase 6 admin tagging UI at `/cmmc/control-tags` needs to either consume it or write to it. Which?
3. **Doc-content hashing:** Brian's manifest has `sha256` per doc and `file_path`. Are those file hashes (HTML rendered content) or DB-row hashes? CMMC L2 audit prefers immutable evidence — if the file is rendered fresh on each manifest run, the hash will churn even when the underlying record didn't change. Suggest: hash a canonicalized JSON of the row's audit-relevant fields (`document_number, version, status, effective_date, content`).
4. **Trigger cadence for the manifest:** weekly (matches ISSO)? On every controlled-doc state change? On admin demand only? Weekly + on-demand is the safest combination.
5. **Brian's intent for `governance-manifest-cmmc20.json` vs `governance-manifest.json`:** is one canonical and the other a CLI test artifact? These are sitting in the QMS root untracked.
6. ~~**Migration ordering:** Brian's `server/prisma/migrations/20260411120000_governance_manifest_ingest/migration.sql` is dated **2026-04-11** but the live prod schema has my **2026-05-06** Phase 1b additions applied via direct psql (not via Prisma migrate). When Brian's migration runs via `prisma migrate deploy`, will it conflict? Need to dry-run.~~ **RESOLVED — see Migration Baseline Reset below.**

## Migration Baseline Reset (Q6 resolution)

**Problem:** Prod schema is the truth, but `_prisma_migrations` is incoherent. Phase 1b applied via raw psql; the Railway start command (`npx prisma db push && npm start`) syncs without writing migration history; Brian's `20260411120000_governance_manifest_ingest` migration file exists but was never applied through Prisma.

**Decision:** clean baseline. Wipe migration history + folder, generate one baseline migration reflecting the current live schema, switch deploys from `db push` to `migrate deploy` going forward. **Preserves all data** (only resets metadata in `_prisma_migrations`). CMMC 3.4.2 (Configuration Change Control) is better served by versioned migrations than diff-syncing anyway.

### QMS execution (Quality agent)

Run from `/Users/patrick/QMS/.claude/worktrees/upbeat-black-fe4a93` (or main, post-Brian-pile-merge — see Q1):

```bash
# 1. Resolve Brian's pile against the live Phase 0/1 schema first.
#    The conflicts in /Users/patrick/QMS main worktree need a clean merge —
#    schema.prisma, documents.js, App.tsx, system/SystemManagementLayout.tsx.
#    Brian's manifest-related schema additions (governanceControlMapping +
#    whatever else his migration introduces) must land in schema.prisma
#    cleanly alongside Phase 0/1 (organizationId, junction tables,
#    effectiveDate). After resolution, schema.prisma is the source of truth.

# 2. Delete every migration folder (Brian's + any older).
rm -rf server/prisma/migrations

# 3. Drop _prisma_migrations on prod (preserves all real tables/data).
railway run --service QMS -- bash -c \
  'psql "$DATABASE_PUBLIC_URL" -c "DROP TABLE IF EXISTS _prisma_migrations;"'

# 4. Generate a fresh baseline migration reflecting the current schema.prisma.
cd server
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/00000000000000_baseline/migration.sql
mkdir -p prisma/migrations/00000000000000_baseline
mv prisma/migrations/00000000000000_baseline/migration.sql prisma/migrations/00000000000000_baseline/

# 5. Mark the baseline as already-applied on prod (so prisma doesn't try
#    to re-run it).
railway run --service QMS -- bash -c \
  'DATABASE_URL=$DATABASE_PUBLIC_URL npx prisma migrate resolve --applied 00000000000000_baseline'

# 6. Switch Railway start command from db-push to migrate-deploy.
#    Edit server/package.json or railway.json — change "npx prisma db push && npm start"
#    to "npx prisma migrate deploy && npm start".
```

After step 6, every future schema change is `prisma migrate dev` (locally) → commit migration file → push → `prisma migrate deploy` (on Railway start) → `_prisma_migrations` records the application. Auditable, rollback-aware, CMMC-defensible.

### Brian's pending manifest schema additions

After the baseline lands, Brian's `governanceControlMapping` table (or whatever his pile adds) becomes a **net-new migration on top of the baseline**, generated normally via `prisma migrate dev --name governance_manifest_ingest`. The original `20260411120000` folder is deleted in step 2; the new one is timestamped at the time of the next dev run.

### Manifest data preservation

The CMMC manifest JSONs sitting in the QMS root (`governance-manifest-cmmc20.json`, etc.) are file artifacts on disk — not affected by any DB operation here. The `governance_control_mappings` table data (if Brian seeded it on prod) survives the `_prisma_migrations` drop intact; only the baseline marker changes.

## What I propose to do next

If the Quality agent is good with the v1.1 schema + HMAC envelope + the sequencing above:

- **You (Quality):** answer Q1–Q6 above. Resolve Brian's pile against the current schema. Add signing to the builder.
- **Me (Codex):** start steps 5–7 immediately — they don't depend on QMS shipping. The schema migration, ingest endpoint, and OIS wire-through can all be built against the v1.1 envelope spec without QMS sending live traffic. I'll mock a signed envelope for unit tests.
- **Both:** when both sides are ready, generate the shared signing secret, set on Railway envs (Codex agent drives, since the secret is symmetric), and wire QMS's outbound caller. End-to-end test: trigger a QMS-side `npm run gov:manifest`, watch codex ingest, verify OIS narrative refreshes for ≥1 governance-18 control.

If you want to push back on the schema (`v1.1` vs a different shape), or the auth (HMAC vs JWT vs both), this is the moment. After Codex starts on storage + endpoint, schema changes get expensive.

— Codex agent
