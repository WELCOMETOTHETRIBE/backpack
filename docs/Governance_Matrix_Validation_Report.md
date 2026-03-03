# Governance Document Matrix — Validation Report

**Source:** [Governance_Document_Matrix.csv](Governance_Document_Matrix.csv)  
**Canonical control set:** 110 NIST SP 800-171 Rev 2 control IDs (`src/lib/artifact-guide.ts`).

---

## Summary

| Metric | Value |
|--------|--------|
| Matrix data rows | 52 |
| Control IDs referenced in "Controls Mapped" | 76 (some controls appear in multiple rows) |
| Invalid control IDs | 0 (all referenced IDs are in the 110 NIST set) |
| Distinct MACTech Document paths | 50 |
| Concrete .md paths (real filenames) | 49 |
| Placeholder path (??? / ADD) | 1 |
| Duplicate paths (same document, multiple rows) | 2 |

**Conclusion:** The matrix analysis is consistent. All control IDs are valid. Required governance *documents* (no duplicates) = **49 existing paths + 1 to be created (Flaw Remediation)** = **50 documents** when complete.

---

## Duplicates

Same MACTech Document path used in more than one row (see [Governance_Matrix_Duplicates.md](Governance_Matrix_Duplicates.md)):

1. **MAC-POL-211_Identification_and_Authentication_Policy.md** — Rows 17 (Identification and Authentication Policy), 20 (Procedures for Authenticator Management).
2. **MAC-SOP-221_User_Account_Provisioning_and_Deprovisioning_Procedure.md** — Rows 18 (Procedures for User Identification and Authentication), 21 (Procedures for establishing, changing, and revoking authenticators).

These are intentional (one document satisfies multiple governance requirements). Count of *physical documents* remains 49 for these paths.

---

## Placeholder

- **Row 53:** Procedures for Flaw Remediation  
- **Path:** `compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-???_Flaw_Remediation_Procedure.md`  
- **Missing:** ADD  
- **Controls Mapped:** 3.14.1  

One document slot required; file to be created.

---

## Control coverage (governance-only view)

- **Controls claimed by at least one matrix row:** 76 distinct control IDs (from 110).
- **Controls not claimed by any governance row:** 34 control IDs. These are expected to be satisfied by technical/OS/cloud implementation (not governance docs). They include, for example: 3.1.3, 3.1.8, 3.1.9, 3.1.10, 3.1.11, 3.1.13–3.1.22, 3.2.2, 3.2.3, 3.4.4–3.4.7, 3.5.2, 3.5.5, 3.5.6, 3.5.8, 3.6.2, 3.7.2–3.7.6, 3.12.3, 3.14.4, 3.14.5.

No action required for unclaimed controls if they are out of scope for governance.

---

## Row-level sanity

- No empty "Governance Document" names.
- No empty "MACTech Document" paths (row 53 has a placeholder path, not empty).
- All rows have at least one control in "Controls Mapped."

Validation complete.
