# Quality App Integration + UI Cleanup Roadmap

**Two interleaved tracks**: (1) repurpose `/dashboard/adjudication/governance`
as a thin viewer over the MacTech Quality App, and (2) execute the UI/UX
cleanup surfaced in the 2026-05-06 audit. The Quality App integration is
sequenced FIRST because it changes what the Governance-18 surface should be,
which in turn affects the cleanup decisions for `/dashboard/adjudication/*`.

---

## Track A — Quality App integration (Phase 13)

### Why the Governance-18 page stays

`/dashboard/adjudication/governance` exists today as a self-contained
document-upload surface for 17 governance controls. Each control detail
page lets the user upload artifacts, edit a narrative, and shows a
status badge. Functional but redundant — MacTech already runs a separate
QMS at `quality.mactechsolutionsllc.com` whose entire purpose is
document control with version, review cadence, and approval workflow.

Two systems holding "is the policy doc current?" is one too many.
Single source of truth: Quality App. Codex becomes a read-only
adjudication consumer.

### What the integration looks like

```
┌────────────────────────────────┐         ┌─────────────────────────────────┐
│  Codex (codex.mactech…)        │         │  Quality App (quality.mactech…) │
│                                │         │                                 │
│  /dashboard/adjudication/      │         │  Document control / QMS         │
│  governance                    │         │  ▪ upload                       │
│  ↓ reads only                  │         │  ▪ versioning                   │
│  ↓                             │ ──HTTP─▶│  ▪ review cadence               │
│  Quality App API client        │         │  ▪ approval / sign-off          │
│  ↓ caches 5 min                │         │  ▪ effective dates              │
│  ↓                             │         │                                 │
│  Per-control adjudication      │         │  Exposes:                       │
│  view: status derived from     │ ◀──────  │  GET /api/cmmc/controls/       │
│  Quality App review state      │         │      [controlId]/documents      │
└────────────────────────────────┘         └─────────────────────────────────┘
```

The codex compliance team STOPS uploading governance docs in codex.
They go to Quality App. Codex pulls the live state back and renders
"is this control's doc current?" against the QMS.

### Contract — what Quality App exposes

Single endpoint, multi-tenant via the existing MacTech identity flow
(MacSuite issues the bearer):

```
GET https://quality.mactechsolutionsllc.com/api/v1/cmmc/controls/{controlId}/documents
Authorization: Bearer <mactech-suite-token>

→ 200 OK
{
  "control_id": "3.1.4",
  "documents": [
    {
      "doc_id": "qms-doc-uuid",
      "title": "Separation of Duties Policy",
      "current_version": "2.4",
      "current_version_effective_date": "2025-11-12T00:00:00Z",
      "last_reviewed_at": "2026-04-03T18:22:00Z",
      "next_review_due_at": "2027-04-03T00:00:00Z",
      "review_cycle_days": 365,
      "review_cycle_status": "current",       // current | due_soon | overdue | expired
      "approver_name": "Patrick Caruso",
      "approval_status": "approved",          // approved | pending_approval | retired
      "permalink": "https://quality.…/documents/qms-doc-uuid",
      "doc_type": "policy",                   // policy | procedure | sop | record
      "control_coverage_note": "Section 4.2 covers SoD enforcement"
    },
    …
  ],
  "summary": {
    "documents_required": 2,
    "documents_present": 2,
    "documents_current": 2,
    "documents_due_soon": 0,
    "documents_overdue": 0,
    "control_coverage_status": "complete"     // complete | partial | absent
  }
}
```

Plus a single bulk endpoint for the Governance-18 list page so we
don't make 17 round-trips:

```
GET https://quality.mactechsolutionsllc.com/api/v1/cmmc/controls/documents
    ?control_ids=3.1.4,3.2.1,3.2.2,…

→ 200 OK
{
  "controls": [
    { "control_id": "3.1.4", "summary": { … } },
    { "control_id": "3.2.1", "summary": { … } },
    …
  ]
}
```

### What the codex adds

1. **`src/lib/integrations/quality-app-client.ts`** — typed HTTP client.
   - Auth: Suite-issued bearer (already used by MacSuite for cross-app
     calls; reuse the env-var pattern from `lib/auth-bearer.ts`).
   - Caches the bulk endpoint per (org) for ~5 minutes in process
     memory; per-control endpoint cached for ~2 minutes (detail pages
     are reload-heavy).
   - Returns `null` on 4xx/5xx so calling pages render gracefully when
     the Quality App is unreachable.

2. **`src/app/dashboard/adjudication/governance/page.tsx`** — replaced.
   - Drop the manual upload + narrative editor.
   - List shows: control_id, title, Quality App `control_coverage_status`
     pill, doc count, "open in Quality App ↗" link.
   - Empty state when no docs present: "No documents tagged for this
     control in the QMS yet — manage in Quality App ↗"

3. **`src/app/dashboard/adjudication/governance/[controlId]/page.tsx`** —
   replaced.
   - Drop the FileUploadWidget + governance narrative textarea.
   - Show: NIST requirement (existing analysis), required docs list
     (existing), Quality App's actual docs (new — title, version,
     last_reviewed_at, next_review_due_at, review_cycle_status pill,
     "open ↗" link).
   - "Manage documents" button → opens Quality App to the control's
     QMS page. ALL writes happen there.

4. **`src/app/dashboard/adjudication/page.tsx`** — currently a redirect
   to `/dashboard/controls`. Either:
   - Remove the redirect (since `/dashboard/adjudication/governance`
     becomes the only thing under this prefix), turning
     `/dashboard/adjudication` into a hub page that lists "engine
     adjudication (CAE) | governance docs (Quality App)"; OR
   - Leave the redirect alone and surface Governance-18 directly in
     the sidebar.

5. **OIS engine integration** (Phase 6 already shipped this concept).
   When the OIS generator computes the narrative for one of the
   Governance-18 controls, it reads from Quality App via the same
   client and emits prose like:
   > "Documentation: governance is captured in QMS document
   > qms-doc-uuid 'Separation of Duties Policy' v2.4, last
   > reviewed 2026-04-03, next review 2027-04-03 (current within
   > the 365-day cycle)."

   This makes the SSP narrative pull both directions — the engine
   already pulls register entries via the same template engine; adding
   a Quality App branch in the template renderer is a ~50 LOC change.

### What the QMS side needs to expose

Confirmed list (sized as a one-way checklist for the Quality App
session):

- [ ] Auth: accept the same Suite-issued bearer the other MacTech
      apps use; cross-org isolation enforced server-side
- [ ] `GET /api/v1/cmmc/controls/{controlId}/documents` — per-control
- [ ] `GET /api/v1/cmmc/controls/documents?control_ids=…` — bulk
- [ ] Tag schema on documents: a document carries N control_ids it
      satisfies (many-to-many)
- [ ] Review-cycle computation: `current` (within cycle), `due_soon`
      (<30d), `overdue` (past), `expired` (>2× cycle past)
- [ ] Permalink stable across versions (resolves to the doc, not a
      specific version)
- [ ] OpenAPI / Zod schema (pasteable into the codex client)

The contract above is the codex's ask. If Quality App is happy with
it, codex implements the client + page rewrites in ~half a session.
If Quality App needs a different shape, we adjust the codex client to
match.

### Acceptance criteria

- [ ] Quality App returns the contract shape for at least one control
- [ ] Codex client reads + caches + renders without crashing when
      Quality App is unreachable
- [ ] Governance-18 list page no longer has upload widgets
- [ ] Per-control detail page links out to Quality App for management
- [ ] OIS narrative for at least one Governance-18 control includes
      Quality App-derived doc reference

---

## Track B — UI/UX cleanup sequencing (post-Quality-App)

The 2026-05-06 audit surfaced 10 items. Here they are, ordered by
dependency on the Quality App integration:

### Sprint 1 — half session, immediate UX win

**Highest leverage. Land first.**

- **A. Add CAE to sidebar.** Phase 7 is invisible. ~5 min: edit
  `src/components/Sidebar.tsx`, add an item under Compliance pointing
  at `/dashboard/cae`.
- **B. Cross-link the three adjudication surfaces.** From SCTM control
  detail, link to CAE engine view + Governance-18 (when applicable).
  From CAE per-control, link to SCTM implementation narrative + Quality
  App doc list. From Governance-18, link to both. ~30 min per page,
  three pages.
- **C. Unify status badges.** One `<ControlBadge type="…" status="…" />`
  component replacing `AdjudicationStatusBadge`, `LifecycleStateBadge`,
  `governance-wizard/StatusBadge`, and the ad-hoc spans. Document the
  three distinct status enums in JSDoc. ~2 hours.

### Sprint 2 — one session, then Quality App integration

**Stable platform before integration.**

- **D. Centralize role gating.** `requireRole(allowed: string[])`
  helper in `src/lib/role-gate.ts`. Replace 11 inline checks across
  the assessor + admin trees. ~2 hours.
- **E. Add try/catch on detail-page DB reads.** Walk every detail
  page; wrap the primary fetch. Show "no data yet" empty state on
  null. Same pattern I used for the SOURCE_LABELS fix. ~3 hours.
- **F. Add breadcrumbs to detail pages.** New `<Breadcrumbs items=…/>`
  primitive. Drop into `/dashboard/evidence-engine/entries/[entryId]`,
  `/dashboard/monitoring/manifests/[id]`, `/dashboard/readiness/
  mock-assessment/results/[id]`. ~2 hours.
- **G. Consolidate manifest-upload entry points.** Single canonical
  page; sidebar + Monitoring + Boundary all link to it. Rename
  "Upload Evidence" → "Upload Manifest" in the sidebar. ~1 hour.

### Sprint 3 — Quality App integration (Phase 13)

**Phase 13 above.** ~half session of codex work after Quality App
side ships the contract. Includes:
- Quality App client
- Governance-18 page rewrite (list + detail)
- OIS template extension for governance controls

This sprint is GATED on the Quality App side. While they're
implementing, codex can ship A-G in parallel.

### Sprint 4 — long tail

**After integration. Two sessions.**

- **H. Fix POA&M dual route.** Pick `/dashboard/poam/[id]` as
  canonical; redirect or delete `/dashboard/poam/entry/[id]`.
- **I. Pagination + date filters on 5 large-list pages.**
  `/dashboard/poam`, `/dashboard/readiness/mock-assessment`,
  `/admin/audit-logs` (already has limit but no cursor),
  `/assessor/ir-tabletop`, `/dashboard/monitoring`.
- **J. Autosave on multi-step forms.** Risk assessment wizard,
  IR tabletop AAR, SSP narrative sections.
- **K. Delete dead code.**
  - `src/components/ActivityTimeline.tsx`
  - `src/components/ComplianceScoreGauge.tsx`
  - `src/components/ControlFamilyHeatMap.tsx`
  - `src/app/dashboard/adjudication/page.tsx` (the redirect — only
    if no inbound links; keep if someone external bookmarked it)
  - `src/app/dashboard/evidence-engine/page.tsx` (the redirect)
  - `src/app/dashboard/evidence/page.tsx` (the redirect)

### Total effort

Roughly **5 sessions of codex-side work**, fan-out:
- Sprint 1: half session
- Sprint 2: one session
- Sprint 3: half session (after Quality App ships its contract)
- Sprint 4: two sessions

Plus the Quality App side's contract implementation, which is your
team's pace.

---

## What I'd do this week

1. **Send the Quality App contract above to whoever owns
   quality.mactechsolutionsllc.com.** That unblocks Sprint 3 in
   parallel with Sprints 1+2.
2. **Ship Sprint 1** (CAE in sidebar + cross-links + unified badge).
   Half session. Immediate UX improvement; nothing depends on the
   Quality App.
3. **Ship Sprint 2** (role gate + breadcrumbs + try/catch + manifest
   consolidation). One session. Hardens the platform.
4. **When Quality App contract is live, ship Sprint 3** (the
   integration). Half session.
5. **Cleanup pass for Sprint 4** when the platform is otherwise
   stable.

Total calendar: ~1.5 weeks if Quality App side is fast; 3 weeks if
they're slow. The cleanup work is independent enough that codex
isn't blocked on Quality App for the first ~70% of the cleanup.

---

## Decisions needed from you before kickoff

1. **Quality App contract** — do you want me to draft the
   contract as a written brief and you forward to the Quality App
   owner? Or are you implementing the Quality App side yourself
   (in which case the spec above is sufficient)?

2. **Sidebar slot for CAE** — Sprint 1 adds CAE to the sidebar.
   Where? Under Compliance group as "Adjudication Engine" alongside
   "SCTM" and "Registers"? Or somewhere else?

3. **Unified badge naming** — `<ControlBadge>` or `<StatusBadge>`?
   The latter conflicts with the existing
   `governance-wizard/StatusBadge`; I'd kill that one and use the
   name. OK?

4. **Three redirect-only pages** — verify no inbound external
   bookmarks before deletion. Are you tracking referrers in any
   analytics, or do we just keep them as redirects forever? They
   cost nothing to keep.

Tell me the answers and I'll start Sprint 1.
