# Cursor Package: CMMC Governance Wizard Build

---

## Step 1 — Attach These Three Files to Cursor

Open Cursor and attach all three files below as context **before** pasting the prompt. These are the exact filenames as they appear in the attachments:

| # | Filename | Purpose |
| :--- | :--- | :--- |
| 1 | `cmmc_governance_wizard_prompt_railway.md` | The master build directive — seven parts, fully specified |
| 2 | `cmmc_unified_schema_prompt.md` | The database schema and downstream document read contracts |
| 3 | `cmmc_unified_artifact_guide.md` | The data source — maps every artifact to every control |

---

## Step 2 — Paste This Prompt Into Cursor

Copy and paste the following text verbatim into Cursor's chat after attaching the three files above.

---

You have been given three context files. Read all three in full before writing a single line of code.

**File 1 is `cmmc_governance_wizard_prompt_railway.md`.** This is the master build directive. Follow it precisely and in the order it is written — Part II (Storage Abstraction Layer) must be built before Part III (Wizard UI), which must be built before Part V (Schema migration). Do not skip ahead.

**File 2 is `cmmc_unified_schema_prompt.md`.** This defines the full database schema. The `controlRecords` table is the single source of truth for the entire platform. Every write operation in the Governance Wizard must target this schema. Every downstream document generator — SSP, SCTM, POA&M, and SPRS score — must read from this schema and from nowhere else.

**File 3 is `cmmc_unified_artifact_guide.md`.** This is the data that drives the Wizard's content. For every control the Wizard renders, the list of required artifacts and the Satisfaction Type badge (Governance-Centric, Hybrid, or Technical-Centric) must be pulled from this file. Do not hardcode artifact names — build a typed data structure from this file and drive all Wizard UI from it.

These are not three separate features. They are one coherent system. The schema is the foundation. The Wizard writes to it. The artifact guide drives the Wizard's content. Build in this order and do not proceed to the next part until the current part compiles and is tested.

Begin with Part II of `cmmc_governance_wizard_prompt_railway.md`: the Storage Abstraction Layer.

---

## What This Build Produces

When complete, the CMMC OS will have:

- A **Storage Abstraction Layer** (`lib/storage/`) with a `PilotStorageService` (S3-compatible, active on Railway) and an `AzureGovStorageService` (built but inactive, activated by setting `STORAGE_PROVIDER=azure_gov`).
- A **Governance Wizard** — a full-screen, multi-step guided experience that walks users through all 14 NIST SP 800-171 control families, prompting them to upload the exact documents required for each governance-relevant control and write their SSP narrative.
- A **four-state Control Implementation Indicator** (Not Started / In Progress / Implemented / Assessed) that is calculated server-side and displayed consistently across the entire platform.
- A **unified `controlRecords` schema** where every piece of compliance data lives. The SSP, SCTM, POA&M, and SPRS score are all rendered from this single source of truth — data entered once, used everywhere.
