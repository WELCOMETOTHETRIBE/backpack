# Canonical Source Unification + SSP Rebuild — Implementation Plan

**Status:** awaiting decision sign-off on the three open architectural
questions in §0. Implementation-detail decisions in §0 are decided.
**Scope:** Codex (this repo) + the EnclaveWatch vault (read side only).
**Why now:** the customer's own gut-check this week (reverting `3.11.1`'s
unbacked attestation, then noticing duplicate IR rows on the SCTM, then
noticing the empty CAE page) all traced back to the same root cause — *no
single canonical source of truth for control adjudication*. The SSP can't
be world-class on top of inputs that disagree. This plan fixes the source
first, then rebuilds the SSP on top.

**Primary source:** every "what must the system do" statement in this
plan is grounded in the *CMMC Assessment Guide — Level 2, Version 2.13,
September 2024 (DoD-CIO-00003 / ZRIN 0790-ZA19)*. References to that
document use [AG p.N] in this doc.

## 0.5. CMMC Assessment Guide ground truth (deterministic)

These facts are non-negotiable and the entire SSP build is shaped by
them. Pulled verbatim or paraphrased close from AG §"Assessment
Findings" [pp.9–11] and CA.L2-3.12.4 [pp.208–210].

1. **Findings vocabulary is fixed: `MET` / `NOT MET` / `NOT APPLICABLE`**
   at the **objective** level. Recorded per 32 CFR § 170.24. *Not*
   `satisfies/partial/at_risk/gap` — that's our internal richness; the
   C3PAO-facing layer must speak MET/NOT MET/N/A.
2. **One NOT MET objective fails the entire requirement.** "CMMC
   assessments are conducted and results are captured at the assessment
   objective level. One NOT MET assessment objective results in a
   failure of the entire security requirement." [AG p.10]
3. **Evidence must be in final form.** "All evidence must be in final
   form and not draft. Unacceptable forms of evidence include working
   papers, drafts, and unofficial or unapproved policies." [AG p.10]
4. **Enduring Exceptions count as MET** when "described, along with any
   mitigations, in the system security plan." [AG p.10]
5. **Temporary deficiencies count as MET** when "appropriately addressed
   in operational plans of action (i.e., include deficiency reviews,
   milestones, and show progress towards the implementation of
   corrections to reduce or eliminate identified vulnerabilities)." [AG
   p.10]
6. **N/A is equivalent to MET for assessment purposes.** "An assessment
   objective assessed as N/A is equivalent to the same assessment
   objective being assessed as MET." [AG p.10]
7. **DoD CIO adjudication of "equally effective" alternative measures
   counts as MET** — but only "if the DoD CIO adjudication must be
   included in the system security plan to receive consideration." [AG
   p.10]
8. **External Service Provider (ESP) satisfaction is allowed.**
   "Satisfaction of security requirements may be accomplished by other
   parts of the enterprise or an External Service Provider (ESP)…
   considered MET if adequate evidence is provided that the enterprise
   or [ESP] implements the requirement objectives." [AG p.11]
9. **An assessment cannot be completed without an up-to-date SSP.** "The
   absence of an up-to-date SSP at the time of the assessment would
   result in a finding that an assessment could not be completed due to
   incomplete information and noncompliance with DFARS clause
   252.204-7012." [AG p.209] — i.e., the SSP module isn't a nice-to-have;
   it's the prerequisite to being assessable at all.

The CMMC Assessment Guide also fixes the SSP's minimum content
(CA.L2-3.12.4 [a]–[h] and Further Discussion):

- **[a]** an SSP is developed
- **[b]** the system boundary is described and documented
- **[c]** the system environment of operation is described and documented
- **[d]** security requirements identified and approved as N/A by the
  designated authority are identified
- **[e]** the method of security requirement implementation is described
  and documented
- **[f]** the relationship with or connection to other systems is
  described and documented
- **[g]** the frequency to update the SSP is defined
- **[h]** the SSP is updated with the defined frequency

…and the "Further Discussion" mandatory sections [AG pp.209–210]:
**Description of the CMMC Assessment Scope; Scope Description (asset
inventory at high level); Environment of Operation (physical
surroundings); Identified and Approved Security Requirements;
Implementation Method for Security Requirements; Connections and
Relationships to Other Systems and Networks; Defined Frequency of
Updates (≥ annual).**

The generated SSP must literally contain these seven sections, in this
order, with the eight [a]–[h] objectives demonstrably satisfied by the
SSP's own content (the SSP self-describes to satisfy CA.L2-3.12.4).

---

## 0. Decision points — please confirm before any code

### 0.1 Which verdict system is canonical?

We currently have two parallel systems and the assessment guide adds a
third — the actual C3PAO-facing vocabulary:

| System | Verdict shape | Confidence | Persisted | Granularity | Audience |
|---|---|---|---|---|---|
| `isControlAdjudicated()` | binary | none | on-read | requirement | internal |
| `scoreControl()` (Phase 7) | `satisfies` / `partial` / `gap` / `at_risk` | yes | `control_adjudication_snapshots` | requirement (with per-requirement breakdown in `requirementsJson`) | internal |
| **CMMC Assessment Guide § 170.24** | **`MET` / `NOT MET` / `NOT APPLICABLE`** | n/a | TBD | **objective** ([a],[b],[c]…) | C3PAO |

The C3PAO records MET/NOT MET/N/A *per assessment objective*. One NOT
MET objective fails the entire requirement. That's the ground truth our
canonical layer must produce.

**Recommendation:** **promote `control_adjudication_snapshots` to THE
canonical state, but extend it to record per-objective verdicts in
MET/NOT MET/N/A vocabulary.** The CAE verdict (`satisfies` /
`partial` / etc.) becomes a *derived rollup* useful for dashboard
sorting and color coding; the MET/NOT MET/N/A per-objective state is
what every C3PAO-facing surface (SSP, audit findings export, attestation
receipt) renders verbatim.

Concretely:

- New column on `control_adjudication_snapshots`:
  `objective_verdicts jsonb NOT NULL DEFAULT '[]'`
  shape: `[{ objective: "a", verdict: "MET" | "NOT_MET" | "NA",
            evidence_ids: string[], rationale: string }, ...]`
- The existing `requirementsJson` field gets enriched with the
  objective letter so the per-objective tagging is queryable.
- Rollup mapping (computed from objective_verdicts):
  ```
  all MET (or N/A)            → satisfies → "MET" at requirement level
  any NOT_MET                 → partial → "NOT MET" at requirement level
  none MET                    → gap → "NOT MET"
  all MET but evidence aging  → at_risk → "MET" (with caveat)
  ```
- The bin-1-5 status (`implemented` / `inherited` / `not_applicable` /
  `outstanding`) becomes a *derived projection* of the requirement-level
  rollup + override hints (§0.2).

The four CMMC paths that elevate a NOT MET to MET (per §0.5 facts 4–7)
are first-class on the snapshot:

- `enduring_exception` — operator declares + mitigation; counts as MET.
- `operational_plan_of_action` — POA&M with milestones + progress;
  counts as MET for temporary deficiencies.
- `dod_cio_adjudication` — pointer to DoD CIO finding of "equally
  effective"; counts as MET when included in SSP.
- `esp_inheritance` — ESP implements; counts as MET when adequate
  evidence is provided.

Each is a column on `control_adjudication_snapshots` carrying the
qualifier reference that the SSP must surface.

### 0.2 Is `control_records.implementation_status` a user input or derived?

Today it's both — operators can set it manually via the SCTM, AND it gets bulk-updated by attestation writes, ingest dispatcher, etc. That's how false positives get in (the May 4 attestation flip).

**Recommendation:** make it a *user override hint* only. The dashboard ALWAYS reads CAE-derived status by default. If an operator explicitly sets a status in the UI, that override is recorded as a row in a new `control_status_overrides` table with reason + user + expiry. The dashboard renders the override visibly distinct ("Operator override: Patrick Caruso, expires 2026-06-09") so an auditor can never mistake an override for a derived verdict. Default behavior: no override → derived.

### 0.3 SSP signing posture

Three options:

- **A. Codex-held signing key** (KMS or env-var). Customer trusts Codex's signature.
- **B. Customer-held signing key** uploaded at finalize time. Codex hashes; customer signs; signature stored.
- **C. Both.** Codex computes a content-hash and detached signature; customer countersigns at finalize.

For pilot **and** for "confidentiality as highest priority," **C is the right answer** — the codex hash binds the evidence; the customer's countersignature binds *them* to the document they're filing with their C3PAO. But it requires standing up a key management story I'd rather scope discretely.

**Recommendation for now: ship A (Codex-held key, existing manifest signer infra), with a `customer_signature` column on `ssp_documents` that's nullable and gets populated when C lands.** This unblocks the SSP build today without painting us into a corner.

### 0.4 PDF rendering library

Codebase declares `@react-pdf/renderer` and `pdfkit`; neither is wired for SSP. **Recommendation: `@react-pdf/renderer`.** The SSP is a structured document with consistent layout — react-pdf's component tree maps cleanly to "section per control." pdfkit is more imperative and gets unwieldy at 110 control sections.

---

## 1. The canonical-source problem — diagnosis

From the parallel surveys, here are the surfaces and their data sources today:

| Surface | Source | Canonical helper? | Risk |
|---|---|---|---|
| `/dashboard` overview | `isControlAdjudicated()` | yes | clean |
| `/dashboard/readiness` | `isControlAdjudicated()` | yes | clean |
| `/api/control-records/adjudicated-ids` | `isControlAdjudicated()` | yes | clean |
| `/dashboard/controls` (SCTM v1) | raw `implementation_status === …` | **no** | diverges from overview by ~4–5 controls when evidence is missing |
| `/dashboard/cae` (SCTM v2 / CAE) | `control_adjudication_snapshots` | partial | stale until next ISSO ingest |
| `/dashboard/poam` | hardcoded `DONE_STATUSES` constant | **no** | shows "implemented" for evidence-less controls |
| `/dashboard/readiness/outstanding` | hand-rolled `liveStatus` per control | partial | minor drift |
| `governance/progress-report` endpoint | hand-rolled `=== "implemented" \|\| "inherited"` | **no** | exported reports may over-claim |

And here are the write paths that **don't** trigger a CAE rescore:

- `POST /api/adjudication/attest` (the attestation click) — only `revalidatePath`, no `scoreAndPersistAll`
- `POST /api/governance/registers/[k]/entries` — register entry insert
- `POST /api/risk-assessments/[id]/finalize` — risk assessment finalize
- `POST /api/poam/*` — POA&M creation/closure
- Manual `control_records` UI flips
- `governance_artifact_completions` insert from artifact-upload paths
- `technical_evidence` write from OS/Azure validators

The only write path that *does* trigger rescore today is the ISSO weekly export ingest (Phase 7 dispatcher hook). That's why the customer hit the empty-CAE-page bug — anyone whose last ISSO ingest predated `a610198` had stale snapshots forever.

---

## 2. Phase A — canonical source unification

### 2.1 New helper: `getControlState(orgId, controlId)`

Returns one shape, used by every UI surface that displays adjudication:

```ts
type ControlState = {
  controlId: string;                                  // "3.1.1"
  caeVerdict: "satisfies" | "partial" | "at_risk" | "gap" | null;
  confidence: number | null;                          // 0..1
  binStatus: "implemented" | "inherited"
           | "not_applicable" | "outstanding";        // derived from CAE
  binSubLabel: string | null;                         // "evidence aging", etc.
  override: {
    setBy: string;
    setAt: Date;
    reason: string;
    expiresAt: Date | null;
  } | null;
  computedAt: Date;
  staleSinceLastEvidence: boolean;                    // §3.2 detector
  evidence: {
    lanes: { technical: bool; register: bool;
             artifact: bool; attestation: bool };
    counts: { register: number; artifact: number;
              attestation: number; technicalRuns: number };
  };
};
```

### 2.2 Migrate the four divergent surfaces

- `/dashboard/controls` (SCTM v1): replace raw `implementationStatus` filters with `getControlState(...).binStatus` checks. Per-control row decoration shows CAE verdict + confidence inline (the SCTM gets a quiet upgrade — it now shows the same numbers as everywhere else).
- `/dashboard/poam`: `DONE_STATUSES` constant deleted; replaced with `getControlState(...).binStatus === "implemented" || "inherited" || "not_applicable"`.
- `/dashboard/readiness/outstanding`: `liveStatus` derived from `getControlState`, not from a separate per-control walk.
- `governance/progress-report` endpoint: same swap.

### 2.3 New table: `control_status_overrides`

```sql
CREATE TABLE control_status_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  control_id varchar(20) NOT NULL,
  override_status varchar(24) NOT NULL,    -- implemented | inherited | not_applicable
  reason text NOT NULL,                    -- non-empty
  set_by_user_id uuid NOT NULL REFERENCES users(id),
  set_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,                  -- null = no expiry
  revoked_at timestamptz,
  revoked_by_user_id uuid REFERENCES users(id),
  CONSTRAINT one_active_per_control UNIQUE (organization_id, control_id)
    WHERE revoked_at IS NULL
);
```

Override UI shows up on the per-control detail page only. Cannot be set from the SCTM bulk-edit (defensive). Always visible to the auditor as "operator override" with reason and user.

### 2.4 Deprecate writes to `control_records.implementation_status`

The column stays for compatibility, but writes go through a single helper `applyControlStatusOverride()` that writes to `control_status_overrides` AND mirrors to the legacy column for the duration of the migration. Phase A is "done" when no other code path writes the legacy column.

---

## 3. Phase B — live status, no staleness

### 3.1 Rescore triggers

Every write path that could affect adjudication calls a single helper:

```ts
await scoreControlsAffectedBy(orgId, {
  source: "attestation_signed" | "register_entry_finalized"
        | "ra_finalized" | "poam_changed" | "manual_override"
        | "ir_bundle_archived" | "qms_manifest_ingested"
        | "isso_export_ingested" | "validator_run_persisted",
  controlHint?: string[],     // narrow scope when caller knows
});
```

Helper resolves which controls to rescore:

- If `controlHint` supplied, rescore those only.
- Else: walk register→control mapping in `control_assessment_logic.v1.json`, rescore every control whose register family was touched.

Implementation: single function in `src/lib/evidence-engine/adjudication/rescore-trigger.ts`. Called inline (synchronous) from the eight write paths above. ~5–10ms per control rescore; an attestation that touches 5 controls costs ~50ms — acceptable for a click.

### 3.2 Stale-snapshot detector

The `getControlState()` helper checks whether `snapshot.computed_at` is older than `max(latest_register_entry, latest_attestation, latest_artifact_completion, latest_technical_evidence)` for the org. If yes, `staleSinceLastEvidence = true` and the UI renders a small "refresh" pill that triggers an on-read rescore of that one control. Belt + suspenders against the rescore-trigger missing a callsite.

### 3.3 Backfill

Reuse `src/scripts/backfill-cae-snapshots.ts` (already shipped). After Phase A, run `--all --confirm` once to bring every org current.

---

## 4. Phase C — the SSP rebuild

### 4.1 Reset

The customer has never used the existing SSP generator and has no opinion
on preserving it. Decision: **scrap the generator code, repurpose only
the parts that aren't load-bearing on the old imperative design.**

**Scrapped (deleted in Phase C):**
- `src/lib/evidence-engine/ssp-generator.ts` — imperative Markdown
  template-substitution. New design (§4.3) is declarative + deterministic +
  signed; preserving this would be more debug-existing-behavior than
  rewriting.
- `src/app/api/ssp/document/route.ts` — Markdown-only export tied to
  `control_records.governance_narrative` / `technical_narrative` (which we
  promote to derived columns in Phase A). Replaced by
  `GET /api/ssp/[id]/{json,md,pdf}` against the new `ssp_documents` table.
- `src/app/api/onboarding/generate-ssp/route.ts` — onboarding-wizard JSON
  export; superseded by the new generator. Onboarding flow gets a one-line
  swap to call the new generator.

**Repurposed (kept and rewired):**
- `src/data/cmmc/ssp_narrative_templates.v1.json` — 110 controls × MDX
  template structure. We rewrite the per-control template body to match
  §4.4's v2 shape, but the catalog (control IDs, families, mapped registers)
  stays. Saves the data-modeling work for 110 controls.
- `src/data/cmmc/control_assessment_logic.v1.json` — register requirements
  per control. Already canonical; the new generator and the CAE scorer
  both read it.
- `src/app/dashboard/ssp/page.tsx` — current "authoring progress" page
  becomes the **SSP Versions** page: lists `ssp_documents` rows for the
  org with their generation timestamp, signature status, and drift state.
  Adds a primary CTA "Generate new version" + per-row drill-down. The
  authoring progress display gets folded into the per-version drill-down
  as a "what evidence backed each section" view.
- `src/app/dashboard/ssp/SspDownloadButton.tsx` — replaced with a small
  format-picker (Markdown / JSON / PDF) hitting the new endpoints.

**Data reset for MacTech (one-time, with audit trail):**

```sql
-- Stale ssp_sections rows from the old generator
DELETE FROM ssp_sections WHERE organization_id = '<mactech>';

-- Stale narrative columns. The new generator derives these from OIS,
-- so the columns become unused once Phase A lands. Clearing them now
-- prevents the legacy /dashboard/ssp progress display from over-claiming
-- during the transition.
UPDATE control_records
   SET governance_narrative = NULL,
       technical_narrative = NULL,
       updated_at = now()
 WHERE organization_id = '<mactech>'
   AND (governance_narrative IS NOT NULL
        OR technical_narrative IS NOT NULL);
```

A `control_record_history` row is written for every cleared narrative so
the audit trail isn't dropped.

**Existing schema:** `ssp_sections` table stays (legacy reads during the
phase-C transition), but no new code writes to it. After Phase C is
deployed and ssp_documents is populated, ssp_sections can be dropped in a
follow-up cleanup migration.

### 4.2 New schema

Three tables. `0068_ssp_documents.sql`:

```sql
CREATE TABLE ssp_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  boundary_id uuid NOT NULL REFERENCES boundary(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,            -- monotonic per org
  status varchar(16) NOT NULL DEFAULT 'draft',-- draft | signed | superseded
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_from_snapshot_at timestamptz NOT NULL,
                                              -- snapshot pin (every cited
                                              -- evidence row was at this
                                              -- state when SSP was authored)
  payload_json jsonb NOT NULL,                -- canonical machine-readable
  payload_md text NOT NULL,                   -- canonical markdown
  pdf_storage_uri text,                       -- vault-mode pointer; null in pilot
  payload_sha256 varchar(64) NOT NULL,        -- SHA-256(canonical JSON)
  signature_alg varchar(32),                  -- "ed25519" | "rs256" | …
  signature_kid varchar(64),
  signature_value text,                       -- detached signature
  signed_at timestamptz,
  signed_by_user_id uuid REFERENCES users(id),
  customer_signature_json jsonb,              -- option C (later); nullable
  superseded_at timestamptz,
  superseded_by_id uuid REFERENCES ssp_documents(id),
  CONSTRAINT ssp_documents_org_version_unique
    UNIQUE (organization_id, version_number)
);

CREATE TABLE ssp_section_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ssp_document_id uuid NOT NULL REFERENCES ssp_documents(id) ON DELETE CASCADE,
  section_kind varchar(32) NOT NULL,
                  -- "system_id" | "boundary" | "personnel" | "control"
                  -- | "esp_inheritance" | "appendix"
  section_key text NOT NULL,
                  -- for control sections: control_id (e.g., "3.1.1")
                  -- for boundary: boundary_id; for personnel: "owner"|"isso"
  order_index integer NOT NULL,
  title text NOT NULL,
  body_md text NOT NULL,
  body_json jsonb,        -- structured form (for the renderer)
  evidence_pinned_sha256 varchar(64) NOT NULL,
                  -- SHA-256 of the section's evidence array at gen time
  CONSTRAINT ssp_section_revisions_doc_section_unique
    UNIQUE (ssp_document_id, section_kind, section_key)
);

CREATE TABLE ssp_evidence_citations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ssp_document_id uuid NOT NULL REFERENCES ssp_documents(id) ON DELETE CASCADE,
  ssp_section_revision_id uuid NOT NULL
    REFERENCES ssp_section_revisions(id) ON DELETE CASCADE,
  control_id varchar(20),
  evidence_kind varchar(32) NOT NULL,
                  -- "register_entry" | "attestation" | "artifact"
                  -- | "technical_run" | "ois_narrative" | "qms_doc"
                  -- | "ir_bundle" | "ra_envelope"
  evidence_id text NOT NULL,        -- whatever uniquely identifies the row
  evidence_sha256 varchar(64),      -- pinned hash at gen time
  evidence_excerpt text             -- short displayable description
);
```

### 4.3 Generator design

`src/lib/ssp/generate.ts` exports `generateSSP(orgId, boundaryId, opts)`. Pipeline:

1. **Snapshot pin** — record `now()` as `generated_from_snapshot_at`. Every subsequent read freezes to this timestamp so the SSP is *deterministic*.
2. **Header sections** — system identification, boundary, personnel, ESP inheritance, CUI categories. Sourced from `organizations`, `boundary`, `boundary_components`, `roles`.
3. **Per-control sections** — for each of the 110 controls:
   - read `getControlState()` (canonical)
   - read `control_observed_implementations` (OIS narrative)
   - read all evidence rows the verdict depended on (register entries, attestations, artifacts, technical runs)
   - read mapped QMS documents (`qms_governance_manifest_documents` joined by `controls_mapped`)
   - compose section body using the v2 narrative template (see §4.4)
4. **Evidence citation** — for each cited evidence row, write a `ssp_evidence_citations` row with the row's SHA-256 hash. The hash is computed *at SSP gen time* by serializing the row deterministically (sorted keys, ISO timestamps).
5. **Render** to Markdown, JSON, and PDF.
6. **Sign** — SHA-256 the canonical JSON; sign with the manifest signer.
7. **Persist** — insert `ssp_documents` row + all child sections + citations in one transaction.

### 4.4 Narrative template v2 — assessment-guide-aligned, "no over-claiming"

Each per-control section in the SSP follows the structure the CMMC
Assessment Guide uses for its own requirement descriptions [AG p.12]
plus the four MET-elevators. The shape:

```
### {{control_code}} — {{control_title}}

**Requirement statement** (verbatim, NIST SP 800-171 Rev 2):
> {{nist_requirement_statement}}

**Aggregate finding:** {{aggregate_finding}}     ← MET / NOT MET / N/A
                                                   one NOT MET objective
                                                   fails the entire
                                                   requirement [AG p.10]

**MET via:** {{met_via}}                          ← one or more of:
                                                   evidence | enduring
                                                   exception | operational
                                                   plan of action | DoD
                                                   CIO adjudication | ESP

#### Assessment objectives [NIST SP 800-171A]
{{#each objectives}}
[{{letter}}] {{objective_text}}
    Finding: {{verdict}}        ← MET / NOT MET / N/A
    {{#if rationale}}Rationale: {{rationale}}{{/if}}
    {{#each cited_evidence}}
    Evidence: {{kind}} — {{excerpt}}
              · sha256:`{{sha256_short}}`
              · {{generated_at}}
    {{/each}}
{{/each}}

#### Implementation method (CA.L2-3.12.4 [e])
{{implementation_summary}}        ← derived from OIS narrative; per-
                                    objective tagging in the prose:
                                    "Authorized users are maintained in
                                    Entra ID [a]. Group membership
                                    governs system access [d,e]…"

#### Connections and relationships
{{#each connections}}
- {{system}} ({{relationship_kind}})
  · evidence: {{evidence_ref}} · sha256:`{{sha256_short}}`
{{/each}}

#### Cryptographic protocols relied on
{{#each crypto_relied_on}}
- {{protocol}} ({{purpose}})
  · FIPS 140-{{fips_version}} validation: {{fips_status}}
{{/each}}

#### Responsible role
{{responsible_role}}

#### Cadence
{{cadence_description}}{{ · next due {{next_due}}}}

{{#if enduring_exception}}
#### Enduring exception (counts as MET per AG p.10)
{{enduring_exception.description}}
**Mitigations:** {{enduring_exception.mitigations}}
{{/if}}

{{#if operational_plan}}
#### Operational plan of action (counts as MET per AG p.10)
**Deficiency review:** {{operational_plan.review_summary}}
**Milestones:**
{{#each operational_plan.milestones}}
- {{date}} — {{description}} ({{status}})
{{/each}}
**Progress to date:** {{operational_plan.progress_summary}}
POA&M reference: {{operational_plan.poam_id}}
{{/if}}

{{#if dod_cio_adjudication}}
#### DoD CIO equally-effective adjudication (counts as MET per AG p.10)
{{dod_cio_adjudication.summary}}
Reference: {{dod_cio_adjudication.reference}}
Issued: {{dod_cio_adjudication.issued_at}}
Applies to objectives: {{dod_cio_adjudication.applicable_objectives}}
{{/if}}

{{#if esp_inheritance}}
#### Inherited from External Service Provider (counts as MET per AG p.11)
**ESP:** {{esp_inheritance.provider_name}}
**ESP type:** {{esp_inheritance.kind}} (CSP / MSP / MSSP / cyber-aaS)
**Objectives satisfied by ESP:** {{esp_inheritance.objectives}}
**Evidence of ESP implementation:** {{esp_inheritance.evidence_ref}}
{{/if}}

{{#if any_not_met_objectives}}
#### Open items
{{#each open_items}}
- [{{objective_letter}}] {{description}}
  · POA&M {{poam_id}} · target {{target_date}}
{{/each}}
{{/if}}
```

Three structural rules enforce "no over-claiming," directly grounded
in the assessment guide:

1. **The aggregate finding is computed, never written.** It's derived
   from the per-objective verdicts via the rollup rule (any NOT MET →
   NOT MET). The narrative cannot say "MET" when one objective is
   NOT MET.
2. **Implementation prose must tag objectives.** Every implementation
   sentence carries `[a,b]`-style objective tags (matching the AG's
   own example style — see AC.L2-3.1.1 examples [AG p.15] and CA.L2-
   3.12.4 example [AG p.210]). A claim with no objective tag is not
   evidence and gets stripped at render time.
3. **Evidence rows are pinned by SHA-256 at SSP-generation time.**
   "Final form" is enforced at the data layer — only register entries
   in `final` lifecycle state, attestations with `attested_at IS NOT
   NULL`, and artifacts with `status ∈ {uploaded, approved}` qualify
   as final per [AG p.10]. Drafts are not citable.

The four MET-elevators are also surfaced verbatim from the snapshot's
columns introduced in §0.1, so the SSP renders them with the same
weight the C3PAO assigns them — they're not foot-notes, they're
first-class section content.

### 4.4a The SSP's mandatory top-level structure (CA.L2-3.12.4)

The SSP itself is a CMMC requirement (CA.L2-3.12.4) and the Further
Discussion [AG pp.209–210] fixes the minimum content. The generated
SSP renders these seven sections in this order so it self-satisfies
[a]–[h]:

| § | SSP section | Satisfies CA.L2-3.12.4 objective |
|---|---|---|
| 1 | **Description of the CMMC Assessment Scope** | [b] system boundary described; [c] environment of operation described |
| 2 | **CMMC Assessment Scope Description** (high-level asset inventory; not every asset embedded — AG fn 186) | [b] |
| 3 | **Description of the Environment of Operation** (physical surroundings) | [c] |
| 4 | **Identified and Approved Security Requirements** (110 controls + any contract-derived adds; including DoD CIO N/A approvals) | [d] |
| 5 | **Implementation Method for Security Requirements** (the 110 per-control sections from §4.4) | [e] |
| 6 | **Connections and Relationships to Other Systems and Networks** (ESPs, interconnections) | [f] |
| 7 | **Defined Frequency of Updates** (≥ annual per AG p.210) | [g], [h] |

§§ 1–4, 6, 7 are auto-composed by the generator from canonical
sources: `boundary` table, `boundary_components`, `organizations`,
`control_records` × `control_status_overrides` for §4 N/A list,
external-service-provider list for §6, an "update cadence" config row
for §7. § 5 is the bulk — 110 control sections per §4.4 above.

Plus three "often includes" sections [AG p.210] that we ship as
auto-composed appendices (the customer doesn't author them, the
generator derives them):

- **Appendix A — General Information System Description** (technical +
  functional summary, derived from `boundary_components` and the org's
  system metadata)
- **Appendix B — Design Philosophies** (defense-in-depth strategies,
  allowed interfaces, network protocols — derived from the
  cryptographic posture aggregation §4.5 plus boundary connection rules)
- **Appendix C — Roles and Responsibilities** (system owner, custodian,
  authorizing officials, ISSO, other stakeholders — derived from
  `organizations` columns + `roles` table; per-control responsible
  role rolled up from `control_records.responsible_role_id`)

### 4.5 "Cryptographic protocols, confidentiality first" treatment

Every control section names the cryptographic protocols it relies on (§4.4 `Cryptographic protections relied on`), drawn from a new fact-table `control_crypto_dependencies`:

```ts
// e.g.
"3.13.8": ["TLS 1.2+ (data in transit)",
           "FIPS 140-2 ciphers via Windows Server 2022 Schannel"],
"3.13.11": ["AES-256-GCM (data at rest, Azure Storage SSE)",
            "Customer-managed keys (Azure Key Vault HSM)"],
"3.5.10": ["Argon2id (password hashing — Azure AD)",
           "TLS 1.3 (token transport)"],
// …
```

The SSP also includes a top-level **"Cryptographic posture appendix"** that aggregates every protocol cited across all 110 controls, with a defensible-against-C3PAO summary: which crypto modules, FIPS validation status, key management story, rotation cadence. This is the single document that proves "confidentiality is the highest priority" — the C3PAO can read one appendix instead of triangulating across 110 sections.

### 4.6 PDF rendering

`src/components/ssp-pdf/Document.tsx` (server-only). Uses `@react-pdf/renderer` with components: `<Cover/>`, `<TOC/>`, `<SystemIdentification/>`, `<BoundarySection/>`, `<PersonnelSection/>`, `<CryptoPosture/>`, `<ControlSection control={c}/>` × 110, `<Appendices/>`. Output streamed to a Buffer, hashed, persisted.

In pilot mode the PDF lives inline in `payload_md` rendering on the dashboard. In vault-mode the PDF bytes go to the vault and `pdf_storage_uri` carries the pointer.

### 4.7 Verification endpoint

`GET /api/ssp/[id]/verify`. Re-derives the SSP from current evidence, hashes, compares to `payload_sha256`. Three outcomes:

- **identical** — nothing has changed; signed SSP is still defensible
- **drift** — evidence changed since signature; lists which sections diverged
- **invalid** — signature won't validate (tamper or key rotation)

This is the "one button the C3PAO presses" check.

---

## 5. Phase D — less attestation, more evidence

Audit each of the 110 controls and produce `docs/SSP-evidence-elevation-table.md`. Per control:

| col | content |
|---|---|
| Control | e.g., `AT.L2-3.2.1` |
| Today's evidence path | "Attestation" / "Register entry" / "Hybrid" |
| Could be elevated to | "TrainOS bundle pull" / "Vault validator" / "QMS digest" / "ISSO weekly review" / "stays attestation" |
| Pipeline that would do it | which existing pipeline already runs this evidence (or "needs build") |
| Effort | "wired" / "small" / "medium" / "large" |
| Notes | rationale, dependencies |

Heuristics for elevation:

- **AT.L2-3.2.x** (training) → already covered by the TrainOS bundle pull pattern (same as IR tabletops). Audit which AT controls use TrainOS-archived training records vs attestation.
- **IR.L2-3.6.x** (incident response) → already covered by IR tabletop bundles.
- **AU.L2-3.3.x** (audit) → covered by the EnclaveWatch vault's audit-event ingest into Codex.
- **CM.L2-3.4.x** (configuration management) → covered by QMS document digest (Configuration Management Plan + Change Drift register).
- **SI.L2-3.14.x** (system integrity) → covered by the vault's vuln remediation ingest.
- **PE/PS/MA** (physical, personnel, maintenance) → mostly attestation-bound for now; some are inherited from Azure FedRAMP High.
- **RA.L2-3.11.x** (risk assessment) → covered by the new TrainOS bridge.
- **CA.L2-3.12.x** (security assessment) → mix; some via OIS narratives, some attestation.

Output of this phase is a target architecture for *each* control. Implementation of the elevations is a follow-up sprint.

---

## 6. Phasing and sequence

| Phase | Description | Why this order |
|---|---|---|
| **0** | Decision sign-off (this doc) | Everything depends on §0.1–0.4 |
| **A** | Canonical source unification | The SSP can't sit on top of disagreeing inputs |
| **B** | Live rescore + stale detector | Without this, "live status" is a lie |
| **C** | SSP rebuild | The user-visible deliverable |
| **D** | Attestation→evidence audit | Independent; informs the next sprint |

Each phase ends with a working, deployable state — no half-built throughs. **Phase A** alone fixes about 80% of the customer's stated complaint ("they all need to be deriving from the same canonical source"). **Phase B** makes it stay fixed. **Phase C** delivers the SSP. **Phase D** is the planning artifact for the next round of elevations.

---

## 7. What is NOT in scope for this plan

- Replacing the SSP narrative templates with hand-authored prose. The auto-generation discipline is what enforces "no over-claim." If a control's auto-generated section is too thin, the fix is *more evidence*, not *more prose*.
- Customer-held signing keys. (§0.3 option C — deferred but the schema is ready for it.)
- Vault-mode PDF storage. The `pdf_storage_uri` column is nullable; pilot mode generates and serves on demand.
- Multi-tenant SSP comparison or cross-org analytics.
- Changes to the EnclaveWatch vault. The vault read-side is fine as-is; this plan is Codex-resident.

---

## 8. Final decisions (production-grade, customer-delegated)

The customer's directive: **intuit, make it production grade, don't
over-claim, anything outstanding in the SCTM is tracked via POA&M.**
That delegates the three architectural calls AND adds a fourth design
principle. Decisions locked:

### Locked

- **§0.1 — `control_adjudication_snapshots` is canonical** with per-
  objective MET/NOT MET/N/A verdicts and the four MET-elevators as
  first-class columns. CAE rollup is derived. Bin-1-5 is derived.
- **§0.2 — `implementation_status` becomes override-only** via
  `control_status_overrides`. Production-grade demands this; a column
  the system writes silently AND operators flip manually is the
  source of every false-positive flip we've seen.
- **§0.3 — Signing posture A+: Codex-held key + Authorizing Official
  attestation row.** Codex signs the SSP content (binding evidence to
  document version). The AO sign-off is captured as an `ssp_signoffs`
  row carrying the AO's name + title + date + the same `data_hash`
  Codex signed. C3PAO sees: "Codex hashed this on T1; AO P. Caruso
  signed off bound to that hash on T2." Customer-key upload (real
  option C) is a follow-up phase when the key story is ready; we ship
  the schema column nullable so it lands without churn.
- **§0.6 — Outstanding-in-SCTM ⇒ Operational Plan of Action (POA&M),
  AG-compliant.** No NOT MET objective is left untracked. Every
  NOT MET objective auto-creates a `poam_entries` row with status
  `draft` (stub). The customer finalizes by filling the AG-mandated
  fields — `deficiency_review_summary`, `milestones[]`,
  `progress_summary` — at which point status flips to `active` and
  the snapshot's `met_via` flips to `operational_plan_of_action`,
  elevating the objective from NOT MET → MET per AG p.10. Drafts do
  NOT elevate (stub POA&Ms can't game the verdict). Chronic-slippage
  detection (open > 365d OR target pushed >2x) flips back to NOT MET
  because AG p.10 reserves the elevator for "temporary deficiencies."

### Decided (implementation detail; not arguing)

- §0.4 — `@react-pdf/renderer`.
- §4.1 — Scrap existing generator; repurpose template catalog + page
  shell; reset MacTech's stale data with audit trail.
- §4.4 — Per-objective tagged narrative + four MET-elevators
  first-class.
- §4.4a — SSP TOC matches CA.L2-3.12.4 verbatim.
- §4.5 — Cryptographic posture top-level appendix.

### What "production grade" means concretely

- **No silent writes to status columns.** Every status mutation goes
  through `applyControlStatusOverride()` or an evidence-driven
  `scoreControlsAffectedBy()` rescore. No more direct
  `UPDATE control_records SET implementation_status = ...` calls.
- **No claim of MET without evidence backing.** The rollup function
  refuses to return MET if zero evidence rows are cited. (A control
  with zero objectives still NOT MET → operational plan elevator
  required.)
- **Final-form enforcement at the data layer.** Drafts are not
  citable in the SSP. Lifecycle states < `final` are filtered out
  in the canonical helper.
- **Chronic-slippage detection.** AG p.10 says POA&Ms cover
  *temporary* deficiencies. A POA&M open > 365 days or with target
  date pushed > 2 times stops counting as a MET-elevator. The SSP
  reports the underlying NOT MET in those cases — defensible to
  the C3PAO because it's honest.
- **Audit trail on every state change.** `control_record_history`
  for every snapshot transition; `audit_logs` for every override,
  POA&M finalize, SSP generate, AO sign-off.

Phase A starts now.
