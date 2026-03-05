# Evidence Engine – Production Checklist

Use this as the **next prompt** (or manual checklist) to harden the Evidence Engine for production.

---

## Already done

- Schema: `register_entry_status`, `default_cadence_days`, `entry_type`, `status`, `finalized_at`, `approved_by_id` (via `db:push` or `apply-evidence-engine-migration`).
- Seed: 23 Evidence Engine registers (org-null templates) via `npm run seed-evidence-engine`.
- Routes: Control dashboard, Registers list, Register entries (with Auditor toggle), Create entry (schema-driven form), Entry detail, Finalize (Admin only).
- Roles: Viewer (Assessor), Editor (Compliance/Admin), Approver (Admin) enforced in API and UI.

---

## 1. Auth

- Set `AUTH_SECRET` (or `NEXTAUTH_SECRET`) in production so NextAuth does not throw `MissingSecret`. Without it, dashboard redirects can loop.

---

## 2. Database

- **Migration path:** If `npm run db:migrate` fails (e.g. due to existing enum/constraint names), run:
  - `DATABASE_URL='...' npm run apply-evidence-engine-migration`
  - Then `npm run seed-evidence-engine`
- **New environments:** Prefer `db:push` for dev/staging, or run the 0027 SQL (see `drizzle/0027_evidence_engine_register_entries.sql`) once, then seed.

---

## 3. Attachments

- Plan: “Allow attachments” on create entry. Currently the create flow does not upload files.
- **Next step:** Reuse or mirror `POST /api/governance/registers/entries/[entryId]/files` for Evidence Engine entries; add an “Attachments” section to the create-entry form and entry detail that lists and uploads files to `governance_register_entry_files` (same table, by `register_entry_id`).

---

## 4. Validation and errors

- Add inline validation (e.g. Zod) for `entryData` in the create-entry API using the same schema (required + enums) and return field-level errors so the UI can show them next to inputs.
- Ensure API error responses use a stable shape (e.g. `{ error: string, code?: string }`) for client handling.

---

## 5. Auditor mode persistence

- Persist “Auditor view” in a query param (e.g. `?auditor=1`) or in sessionStorage so it survives refresh and is shareable via URL.

---

## 6. Performance

- Control dashboard: `getRegisterStatsForOrg` runs one query for all entries then groups in memory; for very large datasets, consider a single aggregated query (e.g. per-register counts and max `finalized_at`) to avoid loading all rows.
- Registers list: Entry counts and “last entry” currently use N+1-style queries; consider one query with group-by or a materialized view if the list is slow.

---

## 7. Security

- Confirm `requireOrg()` and `requireRole()` are used on every Evidence Engine API route.
- If attachments are added, enforce file type/size limits and virus scan or equivalent policy.
- Audit log: `logGovernanceAudit` is called on create and finalize; ensure any PATCH that changes `entryData` or status is also logged.

---

## 8. Regression and E2E

- Add a smoke test or E2E test: sign in → open Evidence Engine → open Registers → open one register → create draft entry → open entry detail → (as Admin) finalize. Optionally assert control dashboard coverage after finalize.

---

## Quick reference

| Task | Command |
|------|--------|
| Apply Evidence Engine schema (if migrate fails) | `DATABASE_URL='...' npm run apply-evidence-engine-migration` |
| Seed 23 registers | `npm run seed-evidence-engine` |
| Push full schema (dev) | `npm run db:push` |
