# CMMC Compliance Control Plane

Multi-tenant, **metadata-only** CMMC Compliance Operating System for CMMC Level 2 enclaves. The Control Plane sits **outside the CUI boundary**, orchestrates compliance, and never stores, processes, or transmits Controlled Unclassified Information (CUI).

## Architecture

- **Data Plane (customer enclave):** Windows Server 2025 VM (or equivalent), CUI storage, evidence artifacts, RunId folders. Evidence remains on the enclave.
- **Control Plane (this app):** Control state engine, POA&M workflow, evidence **metadata** ledger (RunId, path, SHA-256 only), attestation, assessment export, Assessor Mode. **No artifact ingestion.**

All tenant data is partitioned by `organization_id`. The system does not pull evidence automatically, store logs/config/screenshots from the enclave, or require the enclave to function.

## Tech stack

- **Next.js** (App Router), **TypeScript**, **Tailwind CSS**
- **Drizzle ORM** + **PostgreSQL**
- **NextAuth** (credentials, JWT, org + role in session)

## Setup

1. **Environment**
   - `DATABASE_URL` — PostgreSQL connection string (e.g. `postgresql://localhost:5432/control_plane`)
   - `AUTH_SECRET` — NextAuth secret (e.g. `openssl rand -base64 32`)
   - `NEXTAUTH_URL` — App URL (e.g. `http://localhost:3000`)

2. **Install and DB**
   - Create the PostgreSQL database if it doesn’t exist (default name: `control_plane`):
     ```bash
     createdb control_plane
     ```
     If that fails (e.g. permission or wrong user), try:
     ```bash
     psql postgres -c "CREATE DATABASE control_plane;"
     ```
   - Push schema and seed:
   ```bash
   npm install   # if this fails (e.g. ENOTEMPTY), remove node_modules and run again
   npm run db:push   # create/update tables
   npx tsx src/scripts/seed-baseline-windows-server-2025.ts   # optional: OS Baselines (Windows Server 2025) controls + checks
   ```

3. **Seed** (main app: controls, org, admin user)
   - From repo root so TRUST_CODEX path is correct: `cd control-plane && npm run seed`
   - Optional env: `SEED_ORG_SLUG`, `SEED_USER_EMAIL`, `SEED_USER_PASSWORD` (default: admin@example.com / changeme)
   - Seeds 110 NIST SP 800-171 Rev 2 controls and a default org + admin user.

4. **Run**
   ```bash
   npm run dev
   ```
   Sign in at `/auth/signin`, then use Dashboard, Controls, POA&M, Evidence, Governance. Assessor role gets read-only `/assessor`.

## Modules (mapping to end-state)

| # | Module | Capabilities |
|---|--------|--------------|
| 1 | Control Management Engine | 110 controls, status state machine, owner/cadence/validation, immutable history |
| 2 | POA&M Workflow Engine | Items tied to controls, milestones, risk severity, dual sign-off closure, aging |
| 3 | Evidence Metadata Registry | Metadata only (RunId, path, SHA-256); no file upload; many-to-many with controls; expiration alerts |
| 4 | SSP & Governance Authoring | SSP sections, assets, policies; versioning; sign-off via attestations |
| 5 | Assessor Mode | Read-only role, single-tenant view, control → narrative → evidence metadata, boundary banner |
| 6 | Multi-Tenancy & Isolation | organization_id on all tenant tables, RBAC (Admin/Compliance/Assessor), audit log |
| 7 | Attestation & Signature Engine | Generic sign-off (type, resource, signatory, timestamp, hash); used for POA&M closure, docs |
| 8 | Export Engine | `POST /api/export/assessment-package` → `CMMC_Assessment_Package_<Date>.zip` (SSP, POA&M, SCTM, Evidence Index, Asset Inventory, Risk Register, Attestation Logs, Control Status) |
| 9 | Reporting & Dashboard | Executive (compliance %, open POA&Ms, high risk, inheritance); Technical (monitoring, expiring evidence, audit readiness) |
| 10 | System Guardrails | No file upload for enclave evidence (API rejects multipart); CUI pattern warning (client); non-CUI banner; boundary statement page |

## Boundary and compliance

- This system **does not** store CUI. It stores only metadata (e.g. file path, hash, RunId).
- It is **outside** the customer’s CUI boundary and is **not** part of the assessed system.
- Evidence artifacts stay in the customer enclave; the Control Plane is a ledger of compliance claims and pointers.

## References

- End-state capability matrix: see plan / `pasted_content_2.txt`
- Pilot content (controls, evidence design): `../TRUST_CODEX/` (manual-data.json, EVIDENCE_INDEX, SCTM, governance)
