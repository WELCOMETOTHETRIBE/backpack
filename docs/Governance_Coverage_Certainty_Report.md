# Governance Coverage Certainty Report

**Purpose:** Assess how well the current set of 50 required governance documents satisfies the controls that require *documentation* to adjudicate implementation—separate from technical configuration (OS, cloud, enclave).

**Sources:** [Governance_Document_Matrix.csv](Governance_Document_Matrix.csv), [Governance_Required_Documents_List.csv](Governance_Required_Documents_List.csv), `src/lib/artifact-guide.ts`, `src/lib/compliance/control-bins.ts`, [CMMC_18_Governance_Controls_Clean_Analysis.md](CMMC_18_Governance_Controls_Clean_Analysis.md).

---

## 1. Control bins (what needs docs)

| Bin | Count | Needs governance doc? |
|-----|--------|-------------------------|
| **Pure governance** | 17 | Yes — policy/procedure only |
| **Hybrid technical** | 31 | Yes — OS evidence + governance docs to close |
| **Hybrid governance** | 14 | Yes — policy/docs + technical |
| **Pure technical** | 48 | No — technical/OS/cloud only |

**Total controls that require at least one governance document to adjudicate:** 17 + 31 + 14 = **62** (plus some “technical-centric” controls that still list one policy/procedure in the artifact guide).

---

## 2. Matrix vs. required docs

- **Matrix:** 52 rows → **76 control IDs** explicitly mapped to at least one row.
- **Required documents:** 50 unique .md files; all 50 are present (per [Governance_Documents_Presence_Checklist.csv](Governance_Documents_Presence_Checklist.csv)), including MAC-SOP-254 Flaw Remediation.
- **Controls not in matrix:** **34** of 110 have no row. The validation report treats these as “satisfied by technical/OS/cloud only.”

---

## 3. Certainty by category

### High certainty (explicitly mapped + doc present)

- **76 controls** have at least one matrix row and a concrete document path; all of those documents exist in the presence checklist.
- For these, we have **high confidence** that the *documentation required to adjudicate* is present: one document per requirement (with intentional reuse, e.g. MAC-POL-211 for two rows).

### Moderate certainty (same docs, not in matrix)

- Some controls that **require governance docs** per the artifact guide are **not** listed in “Controls Mapped” but are likely satisfied by the **same** documents we already have:
  - **3.2.2, 3.2.3** (role-based training, insider threat): same **MAC-POL-219** and **MAC-SOP-227** as 3.2.1. Content would need to confirm role-based and insider-threat elements.
  - **3.5.5, 3.5.6, 3.5.8** (identifier reuse, inactivity, password rules): often covered in **MAC-POL-211** / **MAC-SOP-221**; not explicitly mapped in matrix.
  - **3.4.5, 3.4.6, 3.4.7** (change access, least functionality, prohibited software): partially covered by **MAC-POL-220**, **MAC-SOP-225**, **MAC-POL-226**; matrix maps 3.4.1, 3.4.2, 3.4.8, 3.4.9.
  - **3.6.2** (incident reporting): likely in **MAC-POL-215** and/or procedures; matrix maps 3.6.1, 3.6.3.
  - **3.7.2, 3.7.4, 3.7.5, 3.7.6** (controlled maintenance, tools, remote maintenance, media sanitization): **MAC-POL-221** and **MAC-SOP-246** may cover; matrix only maps 3.7.1 explicitly.
- **Recommendation:** Add these control IDs to the relevant matrix rows (or add rows) so traceability matches reality and assessors can see the link.

### Lower certainty / content gaps

- **3.1.9** (system use notification / warning banner): Artifact guide expects “System Use Notification / Warning Banner Text” and legal review. No dedicated matrix row; may be in Access Control or another policy—**content check recommended**.
- **3.1.15, 3.1.16, 3.1.20, 3.1.22** (remote execution, wireless, public content, CUI handling): Artifact guide lists specific procedures. Matrix does not map these; may be out of scope for current boundary or covered implicitly—**confirm scope and content**.
- **3.12.3** (continuous monitoring): Artifact guide expects “Procedures for Continuous Monitoring.” Matrix maps 3.12.1, 3.12.2, 3.12.4 only—**confirm whether Security Assessment Policy or another doc covers continuous monitoring**.
- **Content vs. control:** Having a document *path* does not guarantee the *text* satisfies the C3PAO objective. [CMMC_18_Governance_Controls_Clean_Analysis.md](CMMC_18_Governance_Controls_Clean_Analysis.md) spells out what each of the 18 governance-focused controls must address; **spot-checks** against that analysis are recommended for high-risk controls.

---

## 4. Summary

| Question | Answer |
|----------|--------|
| Are all **governance, hybrid, and tech-hybrid** controls satisfied *only* by technical configuration? | No. We have **50 documents** that are intended to satisfy the governance side; **76 controls** are explicitly mapped to those docs. |
| How certain are we that the **documentation** required to adjudicate those controls is in place? | **High** for the **76** controls with an explicit matrix row and a present document. **Moderate** for a subset of the **34** unclaimed controls that the artifact guide says need a doc—many are likely covered by the same 50 docs (traceability missing). **Lower** for a few controls (e.g. 3.1.9, 3.12.3, some 3.1.x/3.7.x) until matrix and content are verified. |
| What would raise certainty? | (1) Add 3.2.2, 3.2.3 (and optionally 3.5.5, 3.5.6, 3.5.8, 3.4.5–3.4.7, 3.6.2, 3.7.2–3.7.6, 3.12.3) to the matrix where the same doc applies. (2) Confirm whether 3.1.9, 3.12.3, and any 3.1.x/3.7.x have a home in existing docs or need a new row/doc. (3) Spot-check key docs against CMMC_18_Governance_Controls_Clean_Analysis. |

---

## 5. Conclusion

- **Governance, hybrid, and tech-hybrid controls are not satisfied only by technical configuration**—we rely on the 50 required governance documents to adjudicate the policy/procedure side.
- We can be **highly confident** for the **76 controls** explicitly mapped in the matrix: the required docs exist and are in the bundle.
- We are **moderately confident** for additional controls that need a doc but are not in the matrix: the same doc set likely covers them; **updating the matrix** would align traceability with that.
- **Certainty for adjudication** will be highest after (a) matrix updates for implicit coverage and (b) content spot-checks against the CMMC 18 analysis for the most governance-critical controls.

---

## 6. Additional documents needed? (detailed analysis)

**Full analysis:** [Governance_Unclaimed_Controls_Analysis.md](Governance_Unclaimed_Controls_Analysis.md).

**Summary:**

- **No new documents are required** to satisfy the unclaimed and lower-certainty controls **if** you:
  1. **Update the matrix** to add control IDs to existing rows (see analysis §4): e.g. add 3.2.2, 3.2.3 to Awareness rows; 3.5.5, 3.5.6, 3.5.8 to MAC-POL-211; 3.6.2 to MAC-POL-215; 3.7.2, 3.7.4, 3.7.5, 3.7.6 to Maintenance/Media Sanitization; 3.12.3 to MAC-POL-224; 3.4.7 to MAC-POL-226; 3.1.22 to MAC-SOP-248; etc.
  2. **Content spot-check** Maintenance Policy (MAC-POL-221) for 3.7.2, 3.7.4, 3.7.5; Configuration Management/Change docs for 3.4.5, 3.4.6.
  3. **Document out-of-scope** in the SSP for 3.1.16 (wireless), 3.1.18 (mobile device), 3.1.20 (public content) if not applicable.

- **Optional (recommended for 3.1.9):** One short **System Use Notification / Warning Banner** document (or appendix in MAC-POL-210) with approved banner text and legal/approval reference—unless MAC-POL-210 already contains and mandates it.

- **Additional docs only if in scope:** Procedures for Wireless Access (3.1.16), Mobile Device Access (3.1.18), or Publicly Accessible Content (3.1.20) are needed only if those capabilities are in the system boundary; otherwise SSP N/A suffices. A distinct Information Flow Control Policy (3.1.3) is only needed if the assessor expects it; otherwise MAC-POL-210 + matrix update can suffice.
