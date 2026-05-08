# Governance Document Matrix — Rows Omitted from the 52-Document Zip

The matrix has **1 header row + 52 data rows** (53 lines total). Of those 52 data rows, **2 are omitted** from the Quality App zip because they don’t point to a single concrete `.md` file to include.

---

## Row 30 — System scope (fixed)

| Column | Value |
|--------|--------|
| **Governance Document** | Network/security architecture documentation and procedures |
| **MACTech Document** | `compliance/cmmc/level2/01-system-scope/` |
| **Controls Mapped** | 3.13.5 |

The matrix lists a **directory** (`01-system-scope/`), not a specific document. The zip script only includes rows whose “MACTech Document” path ends in a `.md` filename, so this row is skipped. To include it, add a specific document path in the matrix (e.g. a chosen scope/architecture doc from that folder).

---

## 2. Row 53 — Placeholder (ADD)

| Column | Value |
|--------|--------|
| **Governance Document** | Procedures for Flaw Remediation |
| **MACTech Document** | `compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-???_Flaw_Remediation_Procedure.md` |
| **Missing** | ADD |
| **Controls Mapped** | 3.14.1 |

The path contains **???** (placeholder) and is marked **ADD** (not yet created). The script skips any path containing `???`, so this row is omitted until the real document exists and the matrix is updated with its actual filename.

---

## Summary

- **52 data rows** in the matrix (rows 2–53). EXPANDED now includes all 52 (Flaw Remediation was missing and has been added).
- **51 rows** have a concrete `.md` path (row 53 is ???/ADD).
- **1 row omitted** from the zip: **Row 53** — Procedures for Flaw Remediation (??? / ADD), until the real document exists.
- **Row 30** now points to **MAC-IT-301_System_Description_and_Architecture.md** (system scope doc in `01-system-scope/`), so it is included when you rebuild the zip.
