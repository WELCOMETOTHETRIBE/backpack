# QMS ↔ Codex CMMC Integration — Session Handoff

**As of 2026-05-06.** You're picking up a multi-week cross-repo integration mid-flight. Both repos are loaded in this session: **MacTech Codex** (CMMC compliance plane, Next.js / Drizzle / Postgres) and **MacTech Quality App / QMS** (document control system, Express / Prisma / Postgres). Read this once, then act across both.

## What this is

Codex is the CMMC compliance plane. For 17 pure-governance CMMC L2 controls (NIST 800-171 R2), satisfaction is proven primarily by policy / procedure documents with current review status. The integration replaces codex's redundant local doc-upload UI with a read-only API call into QMS for "is the policy doc current?" One-way: codex calls QMS; QMS responds; codex never writes back. (Possibility of a future audit-history POST after C3PAO closeout — out of scope for v1.)

The contract is **v2.1 — locked**. Everything in the "Locked decisions" section below is settled. Don't re-litigate.

## Repos

- **Codex**: this worktree, branch `claude/serene-keller-438354` (recent commits: Sprint 1 UI cleanup, governance-18 JSON publish, this handoff doc)
- **QMS**: separate repo loaded in this session — the runbook lives at `docs/CODEX_CMMC_PHASE1_RUNBOOK.md` on that side

## Status

### Done — codex side

- **Sprint 1 UI cleanup** (commits `142e08c` + `6ffacc0`): Adjudication Engine in sidebar; unified `<StatusBadge>` replacing `AdjudicationStatusBadge` + `LifecycleStateBadge` + `governance-wizard/StatusBadge`; cross-links between SCTM ↔ CAE ↔ Governance-18 detail pages
- **Authoritative governance controls list** at [docs/specs/governance-18-controls.json](docs/specs/governance-18-controls.json), commit `2161009`. 17 controls. QMS Phase 6 vendors with a `// SOURCE: codex repo @ 2161009` header. Drift visible in PRs.
- **Specs**: brief v1 at [docs/specs/quality-app-cmmc-integration-brief.md](docs/specs/quality-app-cmmc-integration-brief.md), integration roadmap, UI/UX audit. **Trust the "Locked decisions" section in this doc over the brief markdown** — the v2 → v2.1 deltas were negotiated in conversation and never re-typed into the brief file.

### Done — QMS side (file-level only — NOT executed)

Phase 0 + Phase 1 artifacts produced. 10 modified, 4 created (orgScope helper, two Phase 1 SQLs, runbook). Patrick has not run anything against prod yet.

### Pending — Patrick's execution

This is the gating dependency. Patrick is the only one with prod DB / Railway env access; **don't run prod commands yourself**.

1. `psql $DATABASE_URL -f server/prisma/sql/20260505_phase1a_rename_org_to_mactech.sql` → captures rename UUID
2. Set `MACTECH_DEFAULT_ORG_ID=<uuid>` in Railway env on **both** QMS service and codex service
3. `psql $DATABASE_URL -f server/prisma/sql/20260505_phase1b_add_org_id_and_junctions.sql` → expects `(0, 0, 2)` on org-id null counts; emits `docs_without_effective_date / total_cmmc_docs` (some bundle docs may have unparseable dates — null is acceptable, `synthesizeNextReviewDue` handles it)
4. Deploy QMS branch
5. Smoke test per runbook checklist
6. Forward UUID + (after QMS Phase 2) `mactech-codex` clientId + raw secret OOB

### Pending — QMS phases (after runbook executes)

| Phase | Effort | Output |
|-------|--------|--------|
| 2 | 0.5h | `cmmc:read` scope catalog + `mactech-codex` IntegrationClient seed |
| 3 | 0.5d | Pure helpers + unit tests at `server/src/lib/cmmc/governanceContract.js` |
| 4 | 1.0d | Endpoint handlers at `server/src/cmmcControls.js`; wire into `/api/v1/cmmc` |
| 5 | 1.0h | Frontend permalink shim `/documents/by-code/:documentId` |
| 6 | 1.0d | Tagging admin UI at `/cmmc/control-tags` (Admin-gated) |
| 7 | 0.5d | Zod schemas at `server/src/lib/cmmc/governanceContractSchemas.js` |
| 8 | 0.5d | Integration tests at `server/src/cmmcControls.test.js` |

### Pending — codex sprints

- **Sprint 2** (parallel-safe with QMS): centralize role gating, breadcrumbs on detail pages, try/catch on detail-page Drizzle reads, consolidate manifest-upload entry points
- **Sprint 3** (after QMS Phase 7): typed QMS client at `src/lib/integrations/qms-client.ts` (5-min bulk cache + 2-min per-control cache, graceful fallback); repurpose `/dashboard/adjudication/governance` + `/dashboard/adjudication/governance/[controlId]` to read QMS contracts; extend Phase 6 OIS narrative engine to thread QMS docs through SSP narrative for the 17 controls; smoke test on three controls (one effective, one due_soon, one absent)
- **Sprint 4**: POA&M dual-route consolidation; pagination on 5 list pages; autosave on multi-step forms; delete redirect-only pages + 3 unused viz components

Roadmap detail in [docs/specs/quality-app-integration-and-ui-cleanup-roadmap.md](docs/specs/quality-app-integration-and-ui-cleanup-roadmap.md).

## Locked decisions (v2.1 contract)

### Source federation
Two QMS doc models: `Document` (full QMS workflow with `PeriodicReview`) and `CmmcDocument` (file-backed bundle, no workflow). Both surface in the response with `source: "qms_managed" | "cmmc_bundle"`. Codex shows a chip; OIS narrative threads the source distinction. Long-term migration of bundle docs into full Document workflow is on QMS roadmap, not gating.

### Auth
- QMS's existing client-credentials flow at `POST /api/integrations/token` — clientId + clientSecret → 10-min HS256 JWT
- New scope: `cmmc:read`
- IntegrationClient: `clientId='mactech-codex'`
- Codex stores `QMS_INTEGRATION_CLIENT_ID` + `QMS_INTEGRATION_CLIENT_SECRET` in Railway env; in-memory token cache with refresh-on-expiry

### Tenancy
Single-tenant today. All QMS queries server-side filter by `organizationId === MACTECH_DEFAULT_ORG_ID`. Multi-tenant migration is purely additive: add `IntegrationClient.organizationId`, embed `org` claim in JWT, swap the constant for the claim. `MACTECH_DEFAULT_ORG_ID` lives on **both services' Railway env** for forward-compat.

### Field mappings

**`doc_kind`** (codex enum: `policy | procedure | sop | plan | form | reference | other` — `record` dropped, `plan` and `reference` added):

`Document.documentType` rollup:
- POLICY → `policy`
- SOP, WORK_INSTRUCTION → `sop`
- FORM → `form`
- INCIDENT_RESPONSE_PLAN, CONFIGURATION_MANAGEMENT_PLAN → `plan`
- IT_SYSTEM, SECURITY, AUDIT_ASSESSMENT → `reference`
- OTHER → `other`

`CmmcDocument.kind` (string): lowercased pass-through (`procedure → procedure`, `scope → reference`).

**`qms_doc_type`** (raw, debug/audit):
- `qms_managed`: `Document.documentType` enum value
- `cmmc_bundle`: `CmmcDocument.qmsDocType` raw string (e.g. `"Controlled Document - Policy"`)

**`approval_status`** (codex-facing) + **`qms_native_status`** (raw):

| `Document.status` | → | `approval_status` |
|---|---|---|
| EFFECTIVE | → | `effective` |
| DRAFT | → | `draft` |
| IN_REVIEW, AWAITING_APPROVAL, APPROVED, PENDING_APPROVAL, PENDING_QUALITY_RELEASE | → | `pending` |
| OBSOLETE, ARCHIVED | → | `retired` |

| `CmmcDocument.status` | → | `approval_status` |
|---|---|---|
| EFFECTIVE | → | `effective` |
| DRAFT | → | `draft` |
| IN_REVIEW | → | `pending` |
| RETIRED | → | `retired` |

`APPROVED → pending` is **deliberate**. CMMC adjudication only counts a doc as "in place" once it's EFFECTIVE; signed-off-but-not-yet-released does not satisfy the control.

**`review_cycle_status`** (server-side, single rule for both sources):

```
synthesizeNextReviewDue:
  if next_review_due_at is set: use as-is
  else if source=cmmc_bundle AND cadence_label set AND effectiveDate set:
    return effectiveDate + cadenceInterval(cadence_label)
  else: return null

cadenceInterval:
  "annual" → 365 days; "quarterly" → 90; "monthly" → 30; null/unknown → null

computeReviewCycleStatus(nextReviewDue):
  if null: return "current"
  if now >= nextReviewDue + 365d: return "expired"
  if now >= nextReviewDue: return "overdue"
  if nextReviewDue <= now + 30d: return "due_soon"
  return "current"
```

`review_cycle_days` is **dropped** from the contract. `cadence_label: string | null` returned for OIS narrative interpolation.

**`control_coverage_status`**:
- `complete` = ≥1 doc with `approval_status=effective` AND `review_cycle_status ∈ {current, due_soon}`
- `partial` = ≥1 doc tagged but none meets `complete`
- `absent` = no docs tagged

**`last_reviewed_at`**:
- `qms_managed`: latest `PeriodicReview.completedAt` where `status=COMPLETED`, ordered DESC
- `cmmc_bundle`: **always null.** Bundle docs don't run through `PeriodicReview`. Don't synthesize. Codex narrative degrades gracefully ("effective YYYY-MM-DD" instead of "last reviewed…").

**`approver_name`**:
- `qms_managed`: latest `DocumentSignature.signer` whose `signatureMeaning` indicates approval; fallback to last completed `DocumentAssignment` of type APPROVAL. `signatureMeaning` is free-form text — needs production audit during Phase 4 to find canonical literals
- `cmmc_bundle`: typically null; populate from latest revision signature if available

**`permalink`** (stable across versions; keys off human code, never row UUID):
- `qms_managed`: `https://quality.mactechsolutionsllc.com/documents/by-code/{Document.documentId}`
- `cmmc_bundle`: `https://quality.mactechsolutionsllc.com/cmmc/docs/{CmmcDocument.code}`

**`doc_id`** = human code (e.g. `MAC-POL-210`), stable, displayed.
**`doc_uuid`** = row UUID, may change across versions (each version is a separate row), audit/join only.

### Endpoints

**Per-control**: `GET /api/v1/cmmc/controls/{controlId}/documents` → `{ control_id, documents: [...], summary: {...} }`. Federates both sources. Errors: 404 (unknown control_id; codex falls back to `absent`), 401/403 (token), 5xx (codex falls back to cached/unreachable).

**Bulk**: `GET /api/v1/cmmc/controls/documents?control_ids=3.1.4,3.2.1,…` → `{ controls: [{ control_id, summary }, ...] }`. Summary-only. Cap 50 ids. Order matches request.

### Belt-and-suspenders
At response assembly, assert `doc.organizationId === ORG_ID` per row, throw 500 on mismatch. Surfaces multi-tenant migration bugs at the widest detection point.

## Schema additions (QMS Phase 1)

Already authored, awaiting Patrick's runbook execution:

```prisma
model DocumentCmmcControlTag {
  documentId    String   @map("document_id")
  controlId     String   @map("control_id")
  coverageNote  String?  @map("coverage_note") @db.Text
  createdAt     DateTime @default(now()) @map("created_at")
  document      Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  @@id([documentId, controlId])
  @@index([controlId])
  @@map("document_cmmc_control_tags")
}
model CmmcDocumentControlTag { /* mirror, on CmmcDocument */ }
```

Plus on `Document` and `CmmcDocument`: `organizationId String` (nullable → backfill → NOT NULL) and on `CmmcDocument` only: `effectiveDate DateTime? @db.Date` (regex-guarded backfill from `cmmc_revisions.date` strings; ongoing freshness via `parseEffectiveDate` helper at `server/src/lib/cmmc/docParser.js` mirrored on revision-update).

## Conventions

- **Patrick runs prod commands.** Don't execute runbook SQL, don't touch Railway env, don't push to remotes without explicit per-action approval. Local commits + file writes are fine.
- **Two-commit pattern** in this session: specs/docs commits separate from code commits. Match it.
- **Style**: terse over verbose. No multi-paragraph docstrings. Code comments only when WHY is non-obvious. No emojis in files unless asked.
- **Status badges**: unified `<StatusBadge kind="..." />` is the only badge component on codex side. Don't re-introduce specialized variants.
- **Cross-repo touch-points**: when a change spans both repos (contract field, enum value, governance list), update the codex side first (it's the authoritative source) and have QMS pull in a follow-up PR.

## Immediate next action

**Wait for Patrick's UUID handoff.** Without it, QMS Phase 2 can't seed the IntegrationClient, codex can't mirror the env var, Sprint 3 can't start.

While waiting, the cheapest parallel work is **codex Sprint 2** — role-gate centralization, breadcrumbs, try/catch on detail-page Drizzle reads, manifest-upload consolidation. Doesn't depend on QMS shipping. Confirm with Patrick before starting if any decisions feel non-trivial.

When the UUID lands → mirror in codex Railway env, continue QMS Phase 2 → Phase 8 sequentially, then start codex Sprint 3.
