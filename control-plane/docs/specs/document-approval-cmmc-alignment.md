# Document Approval Workflow — CMMC L2 Alignment

**Status**: spec, in implementation as of 2026-05-07.
**Audience**: anyone touching the QMS document lifecycle, the manifest
release flow, or the codex governance ingest.
**Source**: *CMMC Assessment Guide — Level 2*, Version 2.13 (Sept 2024),
DoD-CIO-00003, NIST SP 800-171 Rev. 2 + 800-171A.

## Why this exists

The 2026-05-06 design of the QMS→Codex manifest pipeline got the
chain-of-custody envelope right (HMAC, content_hash, signing_hash,
per-doc signatures) but left the **document-approval workflow itself**
under-gated. Drafts could ride a release into codex's audit record. The
CMMC L2 assessment guide explicitly rejects that:

> "Documents need to be in their final forms; **drafts of policies or
> documentation are not eligible to be used as evidence** because they
> are not yet official and still subject to change."
> — page 9, *CMMC Assessment Guide L2 v2.13*

> "Unacceptable forms of evidence include working papers, drafts, and
> unofficial or unapproved policies."
> — page 10, *CMMC Assessment Guide L2 v2.13*

> MET requires "All evidence must be in final form and not draft."
> — page 10, *CMMC Assessment Guide L2 v2.13*

This spec redesigns the QMS document approval workflow to enforce that
gate end-to-end, plus aligns each transition with a specific CMMC L2
assessment objective.

## Mapping the workflow to CMMC L2 controls

| Stage | CMMC L2 controls satisfied | Assessment objective(s) |
|---|---|---|
| Draft authoring | — | (informational) |
| Submit for review | CM.L2-3.4.3 [a] | "changes to the system are tracked" |
| Reviewer signature | CM.L2-3.4.3 [b], AU.L2-3.3.9 | "changes are reviewed"; reviewer ≠ approver (separation of audit functions) |
| **Security Impact Analysis** | **CM.L2-3.4.4 [a]** | **"the security impact of changes to the system is analyzed prior to implementation"** |
| Approver signature | CM.L2-3.4.3 [c], CM.L2-3.4.5 [c]/[g], AC.L2-3.1.4 | "changes approved"; "logical access restrictions for changes approved"; separation of duties |
| Quality Manager release | CM.L2-3.4.5 [d]/[h], 21 CFR §211.22 (FDA-aligned) | "logical access restrictions enforced"; release is the gate after which the doc IS the baseline |
| EFFECTIVE state | CM.L2-3.4.1 [a]/[b] | "baseline configuration is established; includes documentation" |
| Audit log of every transition | CM.L2-3.4.3 [d], AU.L2-3.3.1, AU.L2-3.3.2, AU.L2-3.3.8 | "changes logged"; audit-record content + protection |
| Periodic review | CM.L2-3.4.1 [c] | "baseline configuration is maintained (reviewed and updated) throughout the system development life cycle" |

## The state machine

```
                                          ┌─────────────────────────────────┐
                                          │  Author writes / edits content  │
                                          └─────────────────────────────────┘
                                                          │
                                              "Submit for review"  ◄── CM.3.4.3[a] tracked
                                                          ▼
                              ┌──────────────────────────────────────────────────┐
                              │                IN_REVIEW                         │
                              │  Reviewers (≥1) record findings + sign           │
                              │  signatureMeaning = "Reviewer"                   │
                              └──────────────────────────────────────────────────┘
                                                          │
                                          ≥1 Reviewer signature  ◄── CM.3.4.3[b] reviewed
                                                          ▼
                              ┌──────────────────────────────────────────────────┐
                              │                PENDING_SIA                       │
                              │  Security Impact Analysis recorded               │
                              │  by user with security responsibility            │
                              │  (different person from author + each reviewer)  │
                              └──────────────────────────────────────────────────┘
                                                          │
                                          SIA recorded  ◄── CM.3.4.4[a] analyzed
                                                          ▼
                              ┌──────────────────────────────────────────────────┐
                              │            PENDING_APPROVAL                      │
                              │  Designated Approver evaluates the package       │
                              │  (doc + reviewer findings + SIA)                 │
                              └──────────────────────────────────────────────────┘
                                                          │
                                          Approver signs  ◄── CM.3.4.3[c] approved
                                          (signatureMeaning="Approver")
                                          (assertSeparationOfDuties enforced)
                                                          ▼
                              ┌──────────────────────────────────────────────────┐
                              │                  APPROVED                        │
                              │  Doc is signed off, NOT YET in use               │
                              │  Quality Manager has not yet released            │
                              └──────────────────────────────────────────────────┘
                                                          │
                                          Quality Manager
                                          presses "Release"
                                          (document:release permission)  ◄── CM.3.4.5[d]/[h] enforced
                                                          ▼
                              ┌──────────────────────────────────────────────────┐
                              │                EFFECTIVE                         │
                              │  This is the only state CMMC accepts as          │
                              │  evidence. Manifest builder defaults to          │
                              │  releasedOnly=true so codex sees only this.      │
                              └──────────────────────────────────────────────────┘
                                                          │
                                          (over time, periodic review fires)
                                                          ▼
                                          ┌─────────┴─────────┐
                                          ▼                   ▼
                                 New revision needed     Doc deprecated
                                          │                   │
                                          ▼                   ▼
                                NEW Document row         OBSOLETE / ARCHIVED
                                in DRAFT, with
                                supersedesDocumentId
                                pointing at the
                                previous version
```

## Hard gates (enforced server-side)

1. **DRAFT → IN_REVIEW**: author submits; document content non-empty; document_type set.
2. **IN_REVIEW → PENDING_SIA**: ≥1 active `DocumentSignature` with `signatureMeaning ~ /reviewer/i`. Reviewer's `signerId ≠ document.authorId`.
3. **PENDING_SIA → PENDING_APPROVAL**: `Document.securityImpactAnalysis` non-null and non-empty. The user who recorded the SIA must NOT be the author of any prior reviewer signature on this document (CMMC SoD).
4. **PENDING_APPROVAL → APPROVED**: ≥1 active `DocumentSignature` with `signatureMeaning = "Approver"`. Approver's `signerId ≠ document.authorId` AND `signerId ≠` any reviewer's `signerId` AND `signerId ≠ securityImpactAnalysisByUserId`. Approver's user role contains `document:approve` permission.
5. **APPROVED → EFFECTIVE**: caller has `document:release` permission AND has Quality Manager OR System Admin role. `Document.releasedAt` and `Document.releasedByUserId` recorded; `releasedByUserId` MAY equal the Approver (Quality Manager often signs both), but MAY NOT equal the author.
6. **EFFECTIVE content immutable**: any content edit requires a new revision (new Document row with `supersedesDocumentId` pointing to this one). Direct UPDATE to the EFFECTIVE row's `content` field is rejected at the route layer.
7. **Manifest filter**: `buildQmsGovernanceManifestFromDocumentIds` defaults `releasedOnly: true`. Drafts cannot ship. The opt-in `false` is reserved for `/system/governance-package` canonical-package builds where you want to see the FULL roster including in-flight docs (those rows ship with `released: false` and codex's OIS engine ignores them for evidence purposes).

## Schema additions

```prisma
model Document {
  // ... existing fields ...

  // CM.L2-3.4.4 — Security Impact Analysis recorded prior to APPROVED
  // transition. Free-form text capturing what controls the change touches,
  // what risks the change introduces, and the mitigations.
  securityImpactAnalysis             String?    @db.Text                @map("security_impact_analysis")
  securityImpactAnalysisAt           DateTime?                          @map("security_impact_analysis_at")
  securityImpactAnalysisByUserId     String?                            @map("security_impact_analysis_by_user_id")

  // Quality Manager release stamp. Distinct from the Approver signature —
  // an Approver authorizes the change; the Quality Manager confirms the
  // document is ready for production use (CM.L2-3.4.5 enforced step).
  // releasedByUserId may equal an Approver (one person can sometimes wear
  // both hats) but MAY NOT equal the author.
  releasedAt                         DateTime?                          @map("released_at")
  releasedByUserId                   String?                            @map("released_by_user_id")
}
```

## API additions

- `POST /api/documents/:id/security-impact-analysis` — admin-gated
  (`requireRoles('Quality Manager','Manager','System Admin')` +
  `requirePermission('document:review')`). Records SIA. Validates state
  is IN_REVIEW or PENDING_SIA. Validates SIA author SoD against
  reviewers + author. Audit-logs `DOCUMENT_SIA_RECORDED`.
- `POST /api/documents/:id/release` — `requireRoles('Quality Manager','System Admin')` +
  `requirePermission('document:release')`. Validates state is APPROVED,
  signature chain is complete, SIA exists, releasedBy ≠ author. Sets
  `status=EFFECTIVE`, `releasedAt`, `releasedByUserId`. Audit-logs
  `DOCUMENT_RELEASED`.
- All transition endpoints route through `server/src/lib/documentLifecycle.js`
  which holds the gate matrix as a single source of truth.

## Frontend additions

- **WorkflowStepper component** on `DocumentDetail.tsx` shows: current
  state highlighted, list of next-required actions, who must perform
  each, what permissions they need. If the doc is blocked, the stepper
  tells you exactly why.
- **SIA section** with rich text + control-checkbox picker (which CMMC
  controls are touched). Visible to users with `document:review`
  permission once the doc is past IN_REVIEW.
- **Release button** explicitly gated on `released` boolean. If
  unreleased, button is disabled with tooltip showing the missing
  step(s).
- **"Release to Codex" button** (Phase 13) further gated on `released=true`
  — no draft can ship even if a System Admin tries.

## What this preserves

- The existing `DocumentSignature` model with `signatureMeaning` =
  "Reviewer" / "Approver" stays as-is. The new SoD logic just enforces
  who can *be* the next signer.
- The existing `PeriodicReview` model + its history — periodic review
  doesn't change. Once a doc is EFFECTIVE, every periodic review writes
  a new history entry; if the review surfaces a needed change, it
  creates a NEW Document version (new row, supersedes the previous).
- Brian's existing `governanceManifestRoutes.js` self-ingest endpoints
  for QMS-internal audit visibility — unchanged.
- The codex-side ingest endpoint contract (v1.2 envelope) — unchanged.
  Codex doesn't care whether QMS hard-gates drafts; the manifest just
  arrives with `released: false` rows filtered out by the new default.

## What changes

- `buildQmsGovernanceManifestFromDocumentIds` default flips:
  `releasedOnly: true` (was `false`). The Phase 13 release UI does
  NOT take an explicit override — admins must change role + permission
  set to bypass.
- The current `documents` POST/PUT routes lose direct status-write
  capability for `EFFECTIVE`. To get to EFFECTIVE you go through
  `/api/documents/:id/release`.
- New audit-log actions: `DOCUMENT_SIA_RECORDED`, `DOCUMENT_REVIEWED`,
  `DOCUMENT_APPROVED`, `DOCUMENT_RELEASED`. Each writes before/after
  snapshot via the existing audit infra (`server/src/audit.js`).

## Migration plan for in-flight docs

The 54 docs that landed in the v1.0.0 governance package today are
mostly in `AWAITING_APPROVAL` or `DRAFT`. The redesigned flow doesn't
break them — they sit at the same status they were at, just with
sharper gates around what comes next. Specifically:

- Existing DRAFT docs: continue editing, then submit for review.
- Existing IN_REVIEW docs: collect reviewer signatures, then SIA.
- Existing AWAITING_APPROVAL: SIA + Approver signature, then release.
- Existing APPROVED: Quality Manager Release stamp → EFFECTIVE.
- Existing EFFECTIVE: nothing changes. Already meets the bar.

A one-time backfill script optionally records empty `securityImpactAnalysis`
on already-EFFECTIVE rows with a note "pre-CMMC-alignment baseline" so
the SIA-recorded gate doesn't retroactively block them. Their evidence
status stays MET because the field "exists" (per the assessment guide,
"working papers, drafts" are unacceptable; a recorded SIA — even a
post-hoc one — IS evidence of analysis).

## Backward compatibility with the manifest

v1.2 envelope `documents[].released` already exists (we shipped it
2026-05-06). The change here is QMS-side only:

- Before: builder included all docs; UI shipped both released and unreleased
- After: builder excludes unreleased by default; UI button hard-gates on `released`

Codex side does NOT need a schema bump. The same v1.2 envelope works
for both the canonical-package full-roster snapshot AND the
release-to-codex partial pushes — only the `releasedOnly` build option
changes between the two callers.

## Out of scope (future sprints)

- **DocumentChangeRequest model** — formal change-record table separate
  from doc edits. CMMC 3.4.3 wants change *tracking* including the
  *justification*; today it's implicit in the audit log. A first-class
  table makes this queryable for assessors. Not required for v1 of this
  redesign.
- **Configuration Control Board (CCB) workflow** — CM.L2-3.4.3 mentions
  "Configuration Control Boards or Change Advisory Boards that review
  and approve proposed changes." For v1, the Approver signature
  represents the CCB's decision. A future sprint adds an explicit CCB
  meeting record + multi-member sign-off.
- **Auto-detected SoD violations across long-running periods** — we
  enforce SoD per-transition, but a person who's been "approving their
  own reviewer's docs" in aggregate isn't auto-flagged. A reporting
  surface (analytics) catches that pattern.
- **Mass approve / mass release UI** — for high-volume periods. The
  current per-doc release button + bulk-release-to-codex page covers
  the common cases.
