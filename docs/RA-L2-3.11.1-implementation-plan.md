# RA.L2-3.11.1 — Annual Risk Assessment Module

**Status:** Phase 1 in flight (schema + finalize + click-gate). Phase 2 deferred for explicit go-ahead.

## Why this exists

The trigger: on 2026-05-04 a `risk_assessment_program` ATTESTATION row was inserted for MacTech's `3.11.1`, flipping the control to `implemented` on the SCTM dashboard despite the customer never actually performing a risk assessment. The control rolled back to `in_progress` on 2026-05-08 with a `control_record_history` audit row, but the underlying gap — *the attestation click is unguarded* — remained. This module closes that gap and adds the lifecycle envelope the spec demands.

## Adjustment to the generic spec

The spec uses `control_plane_*`-prefixed table names. We don't prefix tables in this codebase — Codex IS the control plane. The actual names are unprefixed.

The spec also asks for tables that already exist in different forms here. The plan reuses where possible and only adds what's genuinely missing.

| Spec table                                  | What we already have                                                                                  | Action                  |
|---------------------------------------------|-------------------------------------------------------------------------------------------------------|-------------------------|
| `control_plane_risk_assessments`            | none — risks live in `governance_register_entries`, but no per-assessment lifecycle envelope          | **add** as `risk_assessments` |
| `control_plane_risk_summary`                | derivable from `governance_register_entries` counts                                                   | **derive on read** — no new table; expose via `GET /api/risk-assessments/[id]`                                                |
| `control_plane_risk_poam_links`             | implicit linkage today via `poam_risk_assessments`; no FK from POA&M to a specific risk's external_id | **add** as `risk_poam_links`                  |
| `control_plane_risk_acceptances`            | no first-class table for executive risk acceptance                                                    | **add** as `risk_acceptances`                 |
| `control_plane_evidence_pointers`           | covered by existing artifact / register / attestation lanes + (future) `risk_assessments.vault_artifact_pointer`        | **reuse**                                     |
| `control_plane_assessment_audit_events`     | `audit_logs` table exists                                                                              | **reuse** with new event names |

## Phase 1 — shipping this turn

1. **Migration `0066_risk_assessment_lifecycle.sql`** — adds three tables:
   - `risk_assessments` (the lifecycle envelope: status, objective_a/b, hashes, vault pointer, finalization, immutability lock)
   - `risk_acceptances` (executive risk acceptance records)
   - `risk_poam_links` (FK between a finalized risk's external id and a POA&M)
2. **`src/db/schema.ts` update** — Drizzle definitions for the three new tables.
3. **`src/lib/risk-assessment/lifecycle.ts`** — module owning the new envelope: create-on-submit, objective evaluator, finalize gate, immutability check.
4. **`src/lib/risk-assessment/audit.ts`** — typed audit-log helper for risk events (writes to existing `audit_logs`).
5. **Update `src/app/api/risk-assessment/submit/route.ts`** — on submit, create or update a `risk_assessments` row in `draft` state alongside the existing `governance_register_entries` writes.
6. **`src/app/api/risk-assessments/[id]/finalize/route.ts`** — finalize endpoint with immutability + objective gates.
7. **`src/app/api/risk-assessments/[id]/risk-acceptances/route.ts`** — POST creates acceptance record; high/critical require executive role.
8. **`src/app/api/risk-assessments/[id]/poam-links/route.ts`** — POST attaches a POA&M to a risk_external_id.
9. **`src/app/api/readiness/ra-3-11-1/route.ts`** — single-card readiness payload.
10. **Click-gate guard** in the existing attestation-template insertion path so `risk_assessment_program` cannot be attested without (a) a finalized `risk_assessments` row in the last 365 days, or (b) an admin-flagged "deferral with rationale."

## Phase 2 — deferred for explicit go-ahead

- Vault-side mirror in EnclaveWatch (`RiskAssessment` entity + sync hosted service + `/RiskAssessments` Razor page) following the `IrTabletopBundle` pattern.
- Codex dashboard card on `/dashboard` for RA.L2-3.11.1 with drill-downs (Assessment Metadata, Objective Evidence Map, Risk Summary, POA&M Linkage, Accepted Risk Register, Audit Trail, Vault Artifact References).
- Wire the **fingerprint into persistence** — currently re-computed on demand. Persist `final_report_sha256` + `package_sha256` on the `risk_assessments` row at finalization.
- Wire **Vault pointer** into a real upload flow. Today the bundle is streamed from `/api/risk-assessment/bundle/[id]` on demand; in production the byte storage should move to the vault and Codex should hold only the pointer + hash.
- POA&M auto-creation flow on `treatment=mitigate`.

## Tenant isolation, RBAC, validation

- Every new endpoint calls `requireOrg()` first (org-scoped) and `requireRole()` second (role-scoped per the table below).
- All new tables have `organization_id NOT NULL` with FK ON DELETE CASCADE; queries filter by `organization_id` explicitly. No RLS is added (matches existing project convention).
- Validation uses Zod schemas on every payload, with `.strict()` to reject unknown fields (data-boundary rule).

| Endpoint                                              | Roles allowed              |
|-------------------------------------------------------|----------------------------|
| `POST /api/risk-assessment/submit`                    | Compliance, Admin          |
| `POST /api/risk-assessments/[id]/finalize`            | Admin                      |
| `POST /api/risk-assessments/[id]/risk-acceptances`    | Admin (executive role required for high/critical)         |
| `POST /api/risk-assessments/[id]/poam-links`          | Compliance, Admin          |
| `GET  /api/readiness/ra-3-11-1`                       | Compliance, Admin, Assessor |

## Audit events emitted

- `risk_assessment.submitted`
- `risk_assessment.objective_status_updated`
- `risk_assessment.finalized`
- `risk_assessment.acceptance_recorded`
- `risk_assessment.poam_linked`
- `risk_assessment.attestation_blocked` (when click-gate fires)

Each carries `{ assessmentId, controlId: "3.11.1", actorRole, before?, after? }` in `details`.

## What's *not* changing

- `governance_register_entries` shape is unchanged. The `entryData.assessment_id` field continues to be the canonical pivot key.
- The existing `risk_assessment_program` attestation template definition in `attestation_templates.v1.json` is unchanged. What changes is *the gate that decides whether the click can produce a row*.
- The existing `/api/risk-assessment/bundle/[assessmentId]` endpoint is unchanged in Phase 1.
