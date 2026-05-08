# Codex UI/UX Audit — 2026-05-06

Comprehensive inventory + identified flaws of the codex (CMMC Control Plane)
Next.js app. Prepared after the Phase 1–10 build-out so accumulated drift could
be assessed against the new adjudication surface.

## TL;DR

The codebase has an "accumulation tax." Every sprint added new surfaces without
retiring the old ones. Three things are causing most of the UX friction today:

1. **Three overlapping adjudication surfaces** — `/dashboard/controls` (SCTM,
   manual narratives), `/dashboard/cae` (Phase 7 engine-derived verdict, NOT in
   sidebar), `/dashboard/adjudication/governance` (Governance-18 docs flow).
   Each uses a different status vocabulary and badge component. No clear story
   for which surface answers which question.

2. **CAE has no entry point.** The Phase 7 work is operational but invisible —
   not in the sidebar, not cross-linked from SCTM, only reachable via direct URL.
   Highest-impact, lowest-effort fix in the audit.

3. **Vocabulary drift.** "Evidence" means three different things. "Review" means
   two different things. "Status" has four different badge components. Same
   control viewed via different paths shows different status enums and
   different colors.

Beyond those three, there's a long tail: scattered role checks, no pagination
on five large-list pages, missing breadcrumbs on detail pages, ~7 KB of dead
visualization components, two manifest-upload entry points pointing at the same
form, two POA&M detail routes.

This document captures the full inventory; the companion brief
[ui-ia-consolidation-roadmap.md] (TBD if approved) sequences the cleanup.

---

## 1. Page Inventory

**Top-level**: `/welcome`, `/boundary`, `/boundary/history`

**Auth-gated (skipped per audit scope)**: `/sign-in`, `/sign-up`,
`/auth/signin`, `/auth/signup`, `/auth/accept-invite/[token]`, `/join/[token]`

**Assessor role** (`/assessor/*`, 9 pages, role-gated via layout +
per-page rechecks): overview, controls, controls/[id], evidence,
registers, ssp, poam, governance, ir-tabletop, ir-tabletop/[exerciseId]

**Auditor role** (`/auditor/*`, 3 pages — Phase 10): index, [controlId],
forbidden

**Admin** (`/admin/*`, 1 page): `/admin/audit-logs` (filterable feed,
shipped earlier this session)

**Dashboard — Compliance cluster**:
- `/dashboard/controls` (SCTM) + `[id]`
- `/dashboard/adjudication` → redirects to `/dashboard/controls`
- `/dashboard/adjudication/governance` (Governance-18 list) + `[controlId]`
- `/dashboard/cae` + `[controlId]/implementation` (Phase 7 engine, NEW)

**Dashboard — Evidence/Registers cluster**:
- `/dashboard/registers` + `[registerId]` + `[registerId]/new`
- `/dashboard/evidence-engine` → redirects to `/dashboard/registers`
- `/dashboard/evidence-engine/registers/[registerId]` (still live + linked)
- `/dashboard/evidence-engine/registers/[registerId]/new`
- `/dashboard/evidence-engine/controls/[controlId]`
- `/dashboard/evidence-engine/entries/[entryId]`
- `/dashboard/evidence-engine/about-collectors`

**Dashboard — Evidence upload**:
- `/dashboard/evidence/upload-manifest`
- `/dashboard/evidence` → redirects to `/dashboard/documents`

**Dashboard — Monitoring**:
- `/dashboard/monitoring`
- `/dashboard/monitoring/manifests/[manifestId]`

**Dashboard — Program management**:
- `/dashboard/documents`, `/dashboard/ssp`
- `/dashboard/boundary`, `/dashboard/boundary/scoping`
- `/dashboard/poam`, `/dashboard/poam/[id]`, `/dashboard/poam/entry/[id]`
  (latter looks duplicative)
- `/dashboard/artifacts` + `[id]`
- `/dashboard/readiness`, `/dashboard/readiness/risk-assessment`,
  `.../wizard`, `/dashboard/readiness/outstanding`,
  `/dashboard/readiness/mock-assessment` + `[id]` + `results/[id]`
- `/dashboard/supply-chain`, `/dashboard/supply-chain/flowdowns`
- `/dashboard/training`
- `/dashboard/admin/assessments` (Phase 10 admin actions, shipped
  earlier this session)

**Dashboard — Utility**: `/dashboard/settings`, `/dashboard/feedback`,
`/dashboard/reporting` (stub)

**Total**: ~69 user-facing pages.

---

## 2. Sidebar Inventory

`src/components/Sidebar.tsx` exposes 14 nav items in three groups:

**Compliance**: Overview, SCTM (`/dashboard/controls`), Registers, Artifacts,
Upload Evidence (`/dashboard/evidence/upload-manifest`), POA&M

**Program**: Documents, SSP, Training, Supply Chain, Readiness, Monitoring

**Utility**: Feedback, Settings

**All linked routes exist; no broken nav links.**

**NOT exposed in sidebar** (discoverable only via direct URL or in-page links):
- `/dashboard/cae` ← Phase 7 adjudication engine, the highest-leverage gap
- `/dashboard/adjudication/governance` ← Governance-18 (only reachable via
  the `/dashboard/adjudication` redirect)
- `/auditor/*` ← intentional (separate role, separate URL family)
- `/assessor/*` ← intentional (separate role, separate URL family)
- `/admin/audit-logs` ← intentional (admin-only)

---

## 3. Component Inventory (`src/components/`)

**Active**: Sidebar, Header, MacTechFooter, DashboardProviders, ExportButton,
FlowDownBanner, NonCuiBanner, CommandPalette

**Dead** (zero imports — candidates for deletion):
- `ActivityTimeline.tsx` (~2.3 KB) — designed for audit timeline, never used
- `ComplianceScoreGauge.tsx` (~2.2 KB) — animated progress gauge, never used
- `ControlFamilyHeatMap.tsx` (~2.6 KB) — NIST family heatmap, never used

**Status-badge sprawl** (4 separate components with overlapping purpose):
- `governance/AdjudicationStatusBadge.tsx` — satisfies / partial / gap / at_risk
- `governance/LifecycleStateBadge.tsx` — draft / admin_signed / isso_verified / …
- `governance-wizard/StatusBadge.tsx` — not_started / in_progress / implemented / …
- `feedback/FeedbackStatusButtons.tsx` — ad-hoc inline spans

---

## 4. Information-Architecture Overlaps

### A. Three adjudication surfaces, three status vocabularies

| Surface | Path | Status enum | Badge | What it answers |
|---|---|---|---|---|
| **SCTM** | `/dashboard/controls` | `implementation_status` (not_started/in_progress/implemented/assessed/inherited/n_a) | `StatusBadge` | "What did the user author about this control?" |
| **CAE** | `/dashboard/cae` | `adjudication_status` (satisfies/partial/gap/at_risk) + confidence | `AdjudicationStatusBadge` | "What did the engine compute from observed evidence?" |
| **Governance-18** | `/dashboard/adjudication/governance` | same as SCTM (StatusBadge enum) | `StatusBadge` | "Has the user uploaded the required policy doc?" |

These are three legitimate questions, but the UI doesn't make the
distinction. A user looking at "3.1.5" on three different pages sees
three different statuses and three different badges. No cross-page
"the engine says X, your authored implementation says Y" view.

### B. Evidence-engine vs Registers — duplicate URL prefix

`/dashboard/evidence-engine` redirects to `/dashboard/registers`, but
its sub-routes (`/registers/[id]`, `/controls/[id]`, `/entries/[id]`,
`/about-collectors`) are still live. Internal links scatter randomly
across both prefixes.

### C. Evidence vocabulary overloaded

- "Upload Evidence" (sidebar) → manifest upload form
- "Evidence Engine" (redirect-only) → was the registers landing
- "Evidence" → redirects to Documents
- "Documents" → SSP + governance docs (not evidence)
- "Manifest" → ISSO export, governance bundle, OS evidence, attestation —
  four things called the same word

### D. POA&M dual detail routes

`/dashboard/poam/[id]` and `/dashboard/poam/entry/[id]` both render
item detail. Likely one is legacy.

### E. Three manifest upload entry points

Sidebar "Upload Evidence", Monitoring page button, Boundary page button —
all point at `/dashboard/evidence/upload-manifest`. Confusing for users
who don't realize they're equivalent.

---

## 5. UX Antipatterns

### A. Role checks scattered across 11 files

Every assessor-gated page does its own `role !== "Assessor"` check
in addition to the layout-level gate. `requireAuditorRole()` exists
at `src/lib/auditor-role-gate.ts` but isn't used by the assessor tree.

**Fix**: Centralize as `requireRole(allowed: string[])`. Use
everywhere.

### B. No pagination on 5 large-list pages

`/dashboard/readiness/mock-assessment`, `/admin/audit-logs`,
`/assessor/ir-tabletop`, `/dashboard/monitoring`, `/dashboard/poam`.
Each loads all rows into memory. `/admin/audit-logs` already has
`limit(200)` but no cursor for "show older."

### C. Status-badge proliferation

Same control, viewed via SCTM vs CAE vs Governance-18, shows three
different status pills with three different color systems. The
auditor reads "3.1.5 implemented" + "3.1.5 satisfies" + "3.1.5
in_progress" and can't reconcile.

### D. Detail-page breadcrumb inconsistency

- `/dashboard/cae/[controlId]/implementation` has `← SCTM` link (wrong;
  doesn't go back to CAE index)
- `/dashboard/monitoring/manifests/[manifestId]` has no back link
- `/dashboard/evidence-engine/entries/[entryId]` has no breadcrumb at all
- `/dashboard/readiness/mock-assessment/results/[id]` has no back link

### E. Pages that 500 on missing data

The `SOURCE_LABELS[row.source]` bug we just fixed on
`/dashboard/evidence/upload-manifest` was one example. There are
likely more — every direct DB read without try/catch is a future
500 candidate.

### F. Forms with no autosave

Risk assessment wizard, Governance-18 doc upload, SSP narrative
sections, IR tabletop AAR form — all multi-field forms that lose
data on accidental navigation.

---

## 6. Naming Inconsistencies

| Concept | Variants in code | Recommended canonical |
|---|---|---|
| Adjudication | "SCTM" / "control adjudication" / "CAE" / "control adjudication engine" | SCTM = manual; CAE = engine-derived |
| Evidence | "manifest" / "register" / "evidence" / "documents" / "upload-manifest" | Manifest = signed bundle; Register = compliance log; Document = governance artifact |
| Review | "weekly_review" / "audit_log_review" / "ISSO weekly review" / "/admin/audit-logs" | "ISSO weekly review" = signed export; "Audit log review" = security log analysis on the vault; "/admin/audit-logs" = system audit trail |
| Attestation vs Acknowledgment vs Verification | break_glass_ack, privileged_grant_justify, change_drift_justify, attest-no-events | Attestation = user-signed claim; Acknowledgment = admin closing a Pattern A loop; Verification = ISSO closing the loop |
| Status | implementation_status / lifecycle_state / adjudication_status | Each is a distinct enum on a distinct entity — pick visually different badges per entity |

---

## 7. Trim Candidates

**Components (delete)**:
- `src/components/ActivityTimeline.tsx`
- `src/components/ComplianceScoreGauge.tsx`
- `src/components/ControlFamilyHeatMap.tsx`

**Redirect-only pages (likely safe; verify no inbound links)**:
- `src/app/dashboard/adjudication/page.tsx` (redirects to `/dashboard/controls`)
- `src/app/dashboard/evidence-engine/page.tsx` (redirects to `/dashboard/registers`)
- `src/app/dashboard/evidence/page.tsx` (redirects to `/dashboard/documents`)

**Likely dead but needs verification**:
- `src/app/dashboard/poam/entry/[id]/page.tsx` (looks duplicative of `/poam/[id]`)
- Any "scheduled to move" features called out in `/dashboard/evidence-engine/page.tsx` comment

---

## 8. Modify Candidates

**A. Add CAE to sidebar.** Highest-leverage fix in the whole audit.
Phase 7 is invisible to users today.

**B. Cross-link the three adjudication surfaces.** From SCTM control
detail, link to CAE engine view. From CAE per-control, link to SCTM
implementation narrative. From Governance-18, link to both.

**C. Unify status badges.** One component with `<ControlBadge
type="adjudication|lifecycle|implementation" status={…} />`. Document
the three distinct status enums.

**D. Add breadcrumbs to detail pages.** `/dashboard/evidence-engine/
entries/[entryId]`, `/dashboard/monitoring/manifests/[id]`,
`/dashboard/readiness/mock-assessment/results/[id]`.

**E. Wrap DB reads in try/catch on detail pages.** Show "no data
yet" empty states instead of 500'ing.

**F. Centralize role gating.** `requireRole(["Admin","Compliance"])`
helper. Replace 11 inline checks.

**G. Consolidate manifest-upload entry points.** Single page; the
sidebar link, Monitoring button, Boundary button all point at the
same destination — maybe rename "Upload Evidence" → "Upload Manifest"
and tuck under Monitoring.

**H. Fix POA&M dual route.** Pick `/dashboard/poam/[id]` as canonical;
delete or redirect `/dashboard/poam/entry/[id]`.

**I. Add date filtering + pagination to large-list pages.**

**J. Add autosave to multi-step forms.**

---

## 9. Recommended sequencing

If you allotted **one session** to this, the highest-leverage moves
are A + B + C — they make the engine-derived adjudication actually
discoverable, give users a coherent story across the three surfaces,
and unify the visual vocabulary. Effort: ~half a session.

If you allotted **a week**: add D + E + F + G. That gives you a
codebase where every detail page has a back-link, no detail page
500s, role gating is consistent, and the manifest-upload story is
single-track. Effort: ~3 sessions.

If you allotted **two weeks**: add H + I + J + the trim of dead
components. That's a fully-shaped codebase ready for the C3PAO
walkthrough.

The dead components and redirect-only pages can be deleted at any
time; they're trim, not modify.

---

## 10. What the audit explicitly did NOT cover

- Mobile responsiveness (likely poor across the board)
- Accessibility (a11y — almost certainly missing)
- Dark mode (probably exists but inconsistent)
- Loading states / skeleton UIs
- Error boundaries (separate from try/catch — Next.js error.tsx files)
- i18n / localization
- Print stylesheets (assessor walkthroughs may print pages)
- Performance / bundle size
- API endpoint inventory (separate scope)

Each of these is its own audit pass.

---

**End of report.** Send the trim/modify decisions back to me and I'll
sequence a cleanup brief in the same shape as the v1.1 cross-repo
brief that worked.
