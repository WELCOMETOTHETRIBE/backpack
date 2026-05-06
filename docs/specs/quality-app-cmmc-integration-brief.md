# MacTech Quality App ↔ Codex CMMC Integration — Brief

**To**: owner of `quality.mactechsolutionsllc.com` (MacTech Quality / QMS)
**From**: MacTech Codex (`codex.mactechsolutionsllc.com`) — CMMC compliance plane
**Status**: contract proposal, requesting Quality App side to implement
**Effort estimate (Quality App side)**: ~3-5 dev days for the two endpoints
+ document-tagging schema, depending on existing schema fit

---

## Why this exists

Codex is the CMMC compliance plane. For the **18 governance-driven CMMC
controls** (3.1.4, 3.2.1-3, 3.3.3, 3.4.4, 3.6.1-3, 3.7.6, 3.9.1-2,
3.11.1, 3.12.1, 3.12.2, 3.12.4, 3.13.13, 3.15.1-3), satisfaction is
proven primarily by **policy / procedure documents** with current review
status. Today the codex carries its own minimal doc-upload UI for these,
which is a redundant second source of truth — the QMS at Quality App is
the canonical home for documents, version control, review cadence,
approval workflow, and effective dates.

The plan: Codex stops holding governance-doc state. Codex calls the
Quality App API for "is the policy doc current?" and renders adjudication
read-only. Compliance team manages every doc in Quality App going
forward.

This brief is the **contract Codex is asking Quality App to expose**.
If the shape needs adjusting (you may already model documents
differently), respond with the deltas and Codex will adapt the client.

---

## What Codex needs

Two HTTP endpoints, both authenticated via the existing MacTech Suite
bearer (the same one MacSuite issues for cross-app calls — Codex already
holds it for inbound calls from EnclaveWatch and other apps; we'll
reuse the same env-var pattern outbound).

### Endpoint 1 — per-control documents

```
GET /api/v1/cmmc/controls/{controlId}/documents
Authorization: Bearer <mactech-suite-token>
```

Returns every document tagged in QMS as covering this CMMC control.

**Response (200)**:
```json
{
  "control_id": "3.1.4",
  "documents": [
    {
      "doc_id": "qms-doc-uuid",
      "title": "Separation of Duties Policy",
      "doc_type": "policy",
      "current_version": "2.4",
      "current_version_effective_date": "2025-11-12T00:00:00Z",
      "last_reviewed_at": "2026-04-03T18:22:00Z",
      "next_review_due_at": "2027-04-03T00:00:00Z",
      "review_cycle_days": 365,
      "review_cycle_status": "current",
      "approver_name": "Patrick Caruso",
      "approval_status": "approved",
      "permalink": "https://quality.mactechsolutionsllc.com/documents/qms-doc-uuid",
      "control_coverage_note": "Section 4.2 covers SoD enforcement"
    }
  ],
  "summary": {
    "documents_required": 2,
    "documents_present": 2,
    "documents_current": 2,
    "documents_due_soon": 0,
    "documents_overdue": 0,
    "control_coverage_status": "complete"
  }
}
```

**Field semantics**:
- `doc_type` enum: `policy | procedure | sop | record | other`
- `review_cycle_status` enum: `current | due_soon | overdue | expired`
  - `current` = within review cycle
  - `due_soon` = `next_review_due_at - now <= 30d`
  - `overdue` = past `next_review_due_at`
  - `expired` = past `next_review_due_at + review_cycle_days` (i.e., 2x past due)
- `approval_status` enum: `approved | pending_approval | retired | draft`
- `control_coverage_status` enum: `complete | partial | absent`
  - `complete` = at least one approved + current document present
  - `partial` = some present but at least one overdue/expired/missing
  - `absent` = no documents tagged for this control
- `permalink` must be **stable across versions** — resolves to the
  document, not a specific version revision
- `documents_required` is QMS's view of how many docs SHOULD cover this
  control (computed by Quality App or hand-tagged); `documents_present`
  is how many ARE tagged

**Empty case (no docs tagged)**:
```json
{
  "control_id": "3.1.4",
  "documents": [],
  "summary": {
    "documents_required": 0,
    "documents_present": 0,
    "documents_current": 0,
    "documents_due_soon": 0,
    "documents_overdue": 0,
    "control_coverage_status": "absent"
  }
}
```

**Errors**:
- `404` — unknown control_id (Codex will fall back to "no docs" empty state)
- `401` / `403` — bearer invalid or lacks scope; Codex shows a clear error
- `5xx` — Codex falls back to a "Quality App unreachable" state and
  renders cached data if any

### Endpoint 2 — bulk lookup

```
GET /api/v1/cmmc/controls/documents?control_ids=3.1.4,3.2.1,3.2.2,...
Authorization: Bearer <mactech-suite-token>
```

Returns the per-control summaries for the Governance-18 list page so
Codex doesn't make 17 round-trips on every list render.

**Response (200)**:
```json
{
  "controls": [
    {
      "control_id": "3.1.4",
      "summary": {
        "documents_required": 2,
        "documents_present": 2,
        "documents_current": 2,
        "documents_due_soon": 0,
        "documents_overdue": 0,
        "control_coverage_status": "complete"
      }
    },
    {
      "control_id": "3.2.1",
      "summary": { "documents_required": 1, "documents_present": 1, "documents_current": 1, "documents_due_soon": 0, "documents_overdue": 0, "control_coverage_status": "complete" }
    }
    /* ... one row per control_id requested ... */
  ]
}
```

The bulk endpoint returns `summary` only, not the full documents array.
Codex calls the per-control endpoint when the user opens a detail page.

`control_ids` is comma-separated. Cap at 50 ids to keep the URL short
(Codex won't ask for more than 18 at a time today, but future scope may
extend to all 110 controls).

---

## What Quality App needs to add (schema)

If your existing Document model doesn't already carry CMMC control tags,
add a many-to-many table:

```
Document <—> ControlTag
  doc_id      → documents.id
  control_id  → CMMC control identifier (string, e.g. "3.1.4")
  coverage_note  → optional free text describing how the doc covers this control
```

A single document can cover multiple controls (one master access-control
policy might satisfy 3.1.1, 3.1.4, 3.1.5, 3.1.6 simultaneously). The
junction table makes the per-control GET cheap.

**No schema changes needed if you already model controls as a tag /
category on documents** — just expose the appropriate filter on the
new endpoints.

---

## What Codex provides back (today: nothing, future: maybe)

The integration is **read-only from Quality App's perspective in v1**.
Codex calls in; Quality App responds; Codex never writes back.

Future possibility (not v1): Codex POSTs an "adjudication mark" back
when a C3PAO assessment closes — "this doc was adjudicated as
satisfying control 3.X.X during assessment Y on date Z." Quality App
could surface this on the doc detail page as audit history. Out of
scope for the initial integration.

---

## Auth

Use the same Suite-issued bearer pattern that other MacTech apps use
for cross-app calls. Codex stores the Quality App token as
`QUALITY_APP_API_TOKEN` in Railway env. Per-org scoping is enforced
server-side in Quality App by mapping the bearer → tenant → returning
only that tenant's documents. Codex doesn't need to send an org_id —
the bearer is org-scoped.

If the existing Suite-bearer flow doesn't yet cover Quality App API
calls, that's the only auth work Quality App needs: register an API
token issuer, validate the bearer on these endpoints.

---

## Acceptance criteria (Quality App side)

- [ ] Per-control endpoint `GET /api/v1/cmmc/controls/{controlId}/documents`
      live + returns the contract shape
- [ ] Bulk endpoint `GET /api/v1/cmmc/controls/documents?control_ids=…`
      live + returns summary-only entries
- [ ] Document-control tagging schema exists (many-to-many with
      `coverage_note`)
- [ ] Review-cycle computation produces the four status values
      (`current | due_soon | overdue | expired`)
- [ ] Permalinks are stable across versions
- [ ] Auth via Suite bearer; per-org isolation server-side
- [ ] OpenAPI / Zod schema document or sample payload published so
      Codex can paste it into the typed client

---

## Acceptance criteria (Codex side, after Quality App ships)

(For your awareness — Codex implements these once the contract is
live; Codex doesn't gate the Quality App acceptance on these.)

- [ ] `src/lib/integrations/quality-app-client.ts` typed client with
      5-min bulk cache + 2-min per-control cache + graceful fallback
      on errors
- [ ] `/dashboard/adjudication/governance` (list) reads bulk endpoint;
      replaces the manual upload widget with "open in Quality App ↗"
      links
- [ ] `/dashboard/adjudication/governance/[controlId]` (detail) reads
      per-control endpoint; shows document table + review status; no
      uploads
- [ ] Codex's Phase 6 OIS narrative engine pulls Quality App docs
      into the SSP narrative for Governance-18 controls (so the
      auto-generated implementation statement reads "Documentation:
      governance is captured in QMS document 'Separation of Duties
      Policy' v2.4, last reviewed 2026-04-03, next review 2027-04-03,
      current within the 365-day cycle.")
- [ ] Smoke test: end-to-end pull on at least three controls
      (3.1.4 + one with `due_soon` doc + one with `absent` coverage)

---

## Calendar

- **Quality App side**: ~3-5 dev days, your team's pace
- **Codex side after Quality App ships**: ~half a session of work

These are decoupled. While Quality App side is implementing, Codex
ships the rest of the UI cleanup roadmap (Sprints 1+2: CAE in sidebar,
unified status badges, role gating, breadcrumbs). When Quality App
contract is live, Codex picks up the integration work in parallel.

---

## Contact

Questions, contract clarifications, scope changes → back to Patrick at
the codex side. Don't make scope decisions unilaterally; the codex's
adjudication engine relies on the contract being predictable, and a
schema change later cascades into the OIS narrative templates.

---

**End of brief.** Ship the contract; Codex will pick up the integration
work the moment it's live.
