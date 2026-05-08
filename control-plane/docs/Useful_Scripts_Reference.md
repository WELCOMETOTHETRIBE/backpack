# Useful Scripts Reference

Personal reference for scripts in the control-plane and related tooling. Run from repo root: `control-plane/`.

---

## Quality App & governance documents

| Script | How to run | What it does |
|--------|------------|--------------|
| **build-quality-app-documents-zip.sh** | `./scripts/build-quality-app-documents-zip.sh` | Builds `Quality_App_Governance_Documents_52.zip`: collects all MAC-* and System_Boundary* .md from the directory above control-plane (TRUST_CODEX bundle) and from control-plane, dedupes by filename, adds Governance Document Matrix CSVs and a README. Use for Quality App submission. |

---

## Database & seeding

| Script | How to run | What it does |
|--------|------------|--------------|
| **seed.ts** | `npm run seed` | Seeds 110 NIST SP 800-171 Rev 2 controls, control families, default org, and admin user. Run from repo root so TRUST_CODEX path is correct. |
| **seed-baseline-windows-server-2025.ts** | `npx tsx src/scripts/seed-baseline-windows-server-2025.ts` | Optional: seeds OS Baselines (Windows Server 2025) controls and checks. Run after `db:push`. |
| **seed-controls-from-parsed-json.ts** | `npm run seed-controls-from-json` or `npx tsx src/scripts/seed-controls-from-parsed-json.ts <path-to-parsed.json>` | Seeds controls from a parsed JSON file (e.g. from assessment guide or evidence run). |
| **seed-governance.ts** | `npx tsx src/scripts/seed-governance.ts` | Seeds governance-related data. |
| **apply-governance-migration.ts** | `npm run db:apply-governance` or `npx tsx src/scripts/apply-governance-migration.ts` | Applies governance migration to the database (requires DATABASE_URL). |
| **seed-evidence-engine.ts** | `npm run seed-evidence-engine` or `npx tsx src/scripts/seed-evidence-engine.ts` | Seeds 23 Evidence Engine registers (org-null templates) from `src/data/cmmc/` artifacts. Run after schema has Evidence Engine columns. |
| **apply-evidence-engine-migration.ts** | `npm run apply-evidence-engine-migration` or `DATABASE_URL='...' npx tsx src/scripts/apply-evidence-engine-migration.ts` | Applies Evidence Engine schema (register_entry_status enum, default_cadence_days, entry_type, status, finalized_at, approved_by_id). Use if `db:migrate` fails. Safe to run multiple times. |

---

## Controls & governance matrix

| Script | How to run | What it does |
|--------|------------|--------------|
| **sync-governance-matrix.ts** | `npm run sync-matrix` or `npx tsx src/scripts/sync-governance-matrix.ts` | Syncs governance document matrix (e.g. from CSV) into app state. |
| **parse-controls-from-guide.ts** | `npm run parse-controls` or `npx tsx src/scripts/parse-controls-from-guide.ts <path-to-pdf-or-txt> [--output controls.json]` | Parses NIST assessment guide (PDF or TXT) and outputs control mapping JSON. |
| **fix-control-titles.ts** | `npm run fix-control-titles` or `npx tsx src/scripts/fix-control-titles.ts` | Fixes control titles in the database. |
| **validate-control-titles.ts** | `npx tsx src/scripts/validate-control-titles.ts` | Validates control titles (e.g. against artifact guide). |
| **governance-inventory.ts** | `npm run governance-inventory` or `npx tsx src/scripts/governance-inventory.ts` | Prints governance document inventory. |

---

## Validation

| Script | How to run | What it does |
|--------|------------|--------------|
| **validate-satisfaction-sources.ts** | `npm run validate-satisfaction-sources` or `npx tsx src/scripts/validate-satisfaction-sources.ts` | Validates satisfaction sources (e.g. control → evidence mapping). |
| **validate-os-evidence-manifest.ts** | `npm run validate-os-evidence-manifest` or `npx tsx src/scripts/validate-os-evidence-manifest.ts` | Validates OS evidence manifest (e.g. 73-control manifest). |
| **validate_windows_server_hardening.py** | `python3 scripts/validate_windows_server_hardening.py [options]` | Windows Server hardening evidence validator. Reads CUI evidence bundle (host/, policy/, audit/, etc.) and produces normalized validation report (JSON + TXT) for control-plane ingestion. See `scripts/tests/` for fixtures. |
| **validate-control-registry-layers.ts** | `npx tsx src/boundary-engine/scripts/validate-control-registry-layers.ts <registry.json> [ontology.json]` | Validates control registry layers against boundary engine ontology. |

---

## Codegen & one-offs

| Script | How to run | What it does |
|--------|------------|--------------|
| **generate-evidence-guide.mjs** | `node scripts/generate-evidence-guide.mjs` | One-off: parses `docs/CMMC_Unified_Guide.md` and generates `src/lib/compliance/control_evidence_guide.ts` (example evidence per control). |

---

## Paths at a glance

- **Shell (run from `control-plane/`):**  
  `scripts/build-quality-app-documents-zip.sh`  
  `scripts/validate_windows_server_hardening.py`  
  `scripts/generate-evidence-guide.mjs`

- **TypeScript (run from `control-plane/` with `npx tsx` or `npm run <script>`):**  
  `src/scripts/seed.ts`  
  `src/scripts/seed-baseline-windows-server-2025.ts`  
  `src/scripts/seed-controls-from-parsed-json.ts`  
  `src/scripts/seed-governance.ts`  
  `src/scripts/apply-governance-migration.ts`  
  `src/scripts/seed-evidence-engine.ts`  
  `src/scripts/apply-evidence-engine-migration.ts`  
  `src/scripts/sync-governance-matrix.ts`  
  `src/scripts/parse-controls-from-guide.ts`  
  `src/scripts/fix-control-titles.ts`  
  `src/scripts/validate-control-titles.ts`  
  `src/scripts/governance-inventory.ts`  
  `src/scripts/validate-satisfaction-sources.ts`  
  `src/scripts/validate-os-evidence-manifest.ts`  
  `src/boundary-engine/scripts/validate-control-registry-layers.ts`

---

*Generated for personal reference. Update as new scripts are added.*
