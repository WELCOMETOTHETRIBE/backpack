# Governance: Unclaimed Controls and Lower-Certainty Analysis

**Purpose:** For the 34 controls not explicitly mapped in the governance matrix (and the lower-certainty set), determine whether they are (1) covered by existing documents (matrix update only), (2) satisfied by content update/spot-check of existing docs, or (3) require **additional documents**.  
**Sources:** [Governance_Document_Matrix.csv](Governance_Document_Matrix.csv), `src/lib/artifact-guide.ts`, [CMMC_18_Governance_Controls_Clean_Analysis.md](CMMC_18_Governance_Controls_Clean_Analysis.md).

---

## 1. Controls not in the matrix (34 total)

Controls with **no row** in "Controls Mapped" today:

3.1.3, 3.1.8, 3.1.9, 3.1.10, 3.1.11, 3.1.13, 3.1.14, 3.1.15, 3.1.16, 3.1.17, 3.1.18, 3.1.19, 3.1.20, 3.1.21, 3.1.22, 3.2.2, 3.2.3, 3.4.4, 3.4.5, 3.4.6, 3.4.7, 3.5.2, 3.5.5, 3.5.6, 3.5.8, 3.6.2, 3.7.2, 3.7.3, 3.7.4, 3.7.5, 3.7.6, 3.12.3, 3.14.4, 3.14.5.

---

## 2. Per-control analysis

### 2.1 No governance document required (artifact guide: N/A or REFERENCE only)

| Control | Artifact guide | Action |
|---------|----------------|--------|
| 3.1.8 | N/A | None. Technical only. |
| 3.1.10 | N/A | None. |
| 3.1.11 | N/A | None. |
| 3.1.13 | N/A | None. |
| 3.1.17 | N/A | None. |
| 3.1.19 | N/A | None. |
| 3.1.21 | N/A | None. |
| 3.4.4 | N/A | None. (CMMC 18 assigns 3.4.4 to MAC-POL-220/MAC-SOP-225; matrix can add for traceability.) |
| 3.5.2 | N/A | None. |
| 3.7.3 | N/A | None. |
| 3.14.4 | N/A | None. |
| 3.14.5 | N/A | None. |

**3.1.14** — System design documentation (REFERENCE). Covered by MAC-IT-301; optional matrix add.

---

### 2.2 Covered by existing document — matrix update only (no new doc)

| Control | Required artifact (artifact guide) | Existing doc that covers it | Matrix action |
|---------|------------------------------------|-----------------------------|----------------|
| 3.1.22 | Procedures for CUI Handling | MAC-SOP-248 CUI Marking and Handling | Add 3.1.22 to MAC-SOP-248 row. |
| 3.2.2 | Role-based security training; MAC-POL-219, MAC-SOP-227 | Same (CMMC 18) | Add 3.2.2 to MAC-POL-219 and MAC-SOP-227 rows. |
| 3.2.3 | Insider threat training; MAC-POL-219, MAC-SOP-227 | Same (CMMC 18) | Add 3.2.3 to MAC-POL-219 and MAC-SOP-227 rows. |
| 3.4.7 | List of prohibited/restricted software | MAC-POL-226 Software Restriction Policy | Add 3.4.7 to MAC-POL-226 row. |
| 3.5.5 | Identifier management; reuse period | MAC-POL-211 and/or MAC-SOP-221 | Add 3.5.5 to MAC-POL-211 row (and/or MAC-SOP-221). |
| 3.5.6 | Period of inactivity (identifier disabled) | MAC-POL-211 and/or MAC-SOP-221 | Add 3.5.6 to MAC-POL-211 row. |
| 3.5.8 | Password complexity, change frequency, reuse | MAC-POL-211 | Add 3.5.8 to MAC-POL-211 row. |
| 3.6.2 | Incident reporting (CMMC 18: MAC-POL-215) | MAC-POL-215 Incident Response Policy | Add 3.6.2 to MAC-POL-215 row. |
| 3.7.6 | Procedures for Media Sanitization | MAC-SOP-246 | Add 3.7.6 to MAC-SOP-246 row. |
| 3.12.3 | Continuous monitoring (CMMC 18: MAC-POL-224) | MAC-POL-224 Security Assessment Policy | Add 3.12.3 to MAC-POL-224 row. |

---

### 2.3 Likely covered by existing doc — matrix update + content spot-check

| Control | Required artifact | Existing doc | Action |
|---------|-------------------|--------------|--------|
| 3.4.5 | Procedures for Access Restrictions for Changes | MAC-POL-220, MAC-SOP-225 | Add 3.4.5 to MAC-POL-220 and/or MAC-SOP-225; verify policy/procedure addresses change access restrictions. |
| 3.4.6 | Procedures for Least Functionality; authorized software list | MAC-POL-220, MAC-SOP-225, MAC-POL-226 | Add 3.4.6 to relevant row(s); verify content. |
| 3.7.2 | Controlled maintenance; authorized maintenance personnel | MAC-POL-221 | Add 3.7.2 to MAC-POL-221; verify policy addresses controlled maintenance and list of personnel. |
| 3.7.4 | Maintenance tool management; approved tools list | MAC-POL-221 | Add 3.7.4 to MAC-POL-221; verify content or add subsection. |
| 3.7.5 | Remote maintenance procedures | MAC-POL-221 | Add 3.7.5 to MAC-POL-221; verify content or add subsection. |

---

### 2.4 Lower certainty — possible new doc or scope decision

| Control | Required artifact | Analysis | Recommendation |
|---------|-------------------|----------|----------------|
| **3.1.9** | System Use Notification / Warning Banner Text; legal review records | No dedicated matrix row or doc. Often in Access Control or standalone. | **Option A:** Add short document (e.g. *System_Use_Notification_Banner.md*) or appendix to MAC-POL-210 with approved banner text and reference to legal review. **Option B:** Add 3.1.9 to MAC-POL-210 and ensure policy includes banner requirement + where banner text is maintained; then content check. |
| **3.1.3** | Information Flow Control Policy; Procedures for Information Flow Enforcement | No dedicated “Information Flow” policy. Sometimes folded into Access Control. | If in scope: add 3.1.3 to MAC-POL-210 (and possibly MAC-SOP-253) if they address information flow; else **new policy/procedure** (only if assessor expects a distinct doc). |
| **3.1.16** | Procedures for Wireless Access | No wireless procedure in set. | If wireless in boundary: **new procedure** (e.g. *Procedures_for_Wireless_Access*). If no wireless: document “not applicable” in SSP; no new doc. |
| **3.1.18** | Procedures for Mobile Device Access | No mobile device procedure in set. | If mobile device access in scope: **new procedure**. If not: N/A in SSP; no new doc. |
| **3.1.20** | Procedures for Publicly Accessible Content | No procedure in set. | If publicly accessible content in scope: **new procedure**. If not: N/A in SSP; no new doc. |

---

## 3. Summary: additional documents needed

### 3.1 No additional documents required if

- You **update the matrix** for all controls in §2.2 and §2.3 (add control IDs to existing rows).
- You perform **content spot-checks** for §2.3 (3.4.5, 3.4.6, 3.7.2, 3.7.4, 3.7.5) and, for 3.1.9, either add banner text to an existing doc or add 3.1.9 to MAC-POL-210 and verify policy references banner.
- For **3.1.16, 3.1.18, 3.1.20**: you confirm in the **SSP** that wireless / mobile device access / publicly accessible content are **out of scope** (no new docs).

### 3.2 Additional document(s) to consider (only if in scope or required by assessor)

| # | Document | Controls | When needed |
|---|----------|----------|-------------|
| 1 | **System Use Notification / Warning Banner** (text + approval reference) | 3.1.9 | If you do not embed banner text in MAC-POL-210 or another existing doc. Small standalone doc or appendix is sufficient. |
| 2 | **Procedures for Wireless Access** | 3.1.16 | Only if wireless access is in the system boundary. |
| 3 | **Procedures for Mobile Device Access** | 3.1.18 | Only if mobile device access to CUI/system is in scope. |
| 4 | **Procedures for Publicly Accessible Content** | 3.1.20 | Only if the system has publicly accessible content. |
| 5 | **Information Flow Control Policy** (and/or procedure) | 3.1.3 | Only if assessor expects a distinct document; otherwise cover via MAC-POL-210 + matrix update. |

### 3.3 Conclusion

- **No new documents are required** for the 34 unclaimed controls **provided** you:  
  (1) update the matrix as in §2.2 and §2.3,  
  (2) verify content for §2.3 and 3.1.9 (banner), and  
  (3) document out-of-scope for 3.1.16, 3.1.18, 3.1.20 in the SSP when applicable.
- **One optional, low-effort addition** that improves certainty for 3.1.9: a short **System Use Notification / Warning Banner** document (or appendix) with the approved banner text and a reference to legal/approval, unless MAC-POL-210 already contains and mandates it.
- **Additional procedures** (wireless, mobile device, public content, or information flow) are needed **only if** those capabilities are in scope; otherwise, SSP N/A statements suffice.

---

## 4. Recommended matrix updates (no new docs)

Add the following control IDs to the existing rows (Governance_Document_Matrix.csv and EXPANDED) so traceability matches coverage:

| Row / Governance document | Add controls to "Controls Mapped" |
|---------------------------|-----------------------------------|
| MAC-POL-219 (Awareness and Training Policy) | 3.2.2; 3.2.3 |
| MAC-SOP-227 (Security Awareness Training Procedure) | 3.2.2; 3.2.3 |
| MAC-POL-211 (Identification and Authentication Policy) | 3.5.5; 3.5.6; 3.5.8 |
| MAC-POL-215 (Incident Response Policy) | 3.6.2 |
| MAC-POL-220 (Configuration Management Policy) | 3.4.5; 3.4.6 (optional: 3.4.4) |
| MAC-SOP-225 (Configuration Change Procedure) | 3.4.5; 3.4.6 |
| MAC-POL-221 (Maintenance Policy) | 3.7.2; 3.7.4; 3.7.5; 3.7.6 |
| MAC-SOP-246 (Media Sanitization Procedure) | 3.7.6 (already has 3.8.3; 3.8.7) |
| MAC-POL-224 (Security Assessment Policy) | 3.12.2; 3.12.3 |
| MAC-POL-226 (Software Restriction Policy) | 3.4.7 |
| MAC-SOP-248 (CUI Marking and Handling Procedure) | 3.1.22 |

After these updates, the matrix will explicitly map **88+** control IDs (76 + 12+ from above) with no new documents.
