# CUI Marking and Handling Procedure

**Document ID:** MAC-SOP-248  
**Version:** 1.0  
**Effective date:** Upon approval  
**Classification:** Internal — CUI Enclave  
**Document owner:** CISO or designated System Owner  
**Approval authority:** CISO or designated Authorizing Official  
**Next review date:** Annually from effective date  
**Related NIST control:** SC.L2-3.8.1 (Protect CUI at rest); SC.L2-3.8.2 (CUI marking); SC.L2-3.8.4 (Media access); SC.L2-3.8.5 (Media markup)

---

## Document control

| Version | Date | Description | Author |
|---------|------|-------------|--------|
| 1.0 | — | Initial release | — |

---

## 1. Purpose

This procedure defines how the MacTech CUI enclave marks and handles CUI in documents and systems so that CUI is identifiable and accessible only to authorized users. It applies only to the boundary in System Boundary and Scope (MAC-SCOPE-001): Microsoft Azure Government and the Windows VM(s), with user access via Entra ID, VPN, and MFA.

---

## 2. Scope

- **In scope:** Marking of CUI in documents (header/footer, labels); marking or identification of CUI in systems (folders, resources, tags); handling standards (access, storage, transmission, destruction); training and awareness for personnel who create or handle CUI.
- **Out of scope:** Marking and handling of information outside the CUI enclave boundary; classification of information under other schemes (e.g., classified).

---

## 3. Prerequisites

- Media Handling & Data Disposal Policy (MAC-POL-213) and CUI Enclave User Agreement and Rules of Behavior (MAC-FRM-204).
- Defined CUI categories and marking format (e.g., CUI//CATEGORY or organizational standard); access control so only authorized users can access CUI (per MAC-POL-210 and MAC-SOP-221).

---

## 4. Procedure

### 4.1 Marking CUI in documents

1. **Standard marking.** All documents (files, emails, printouts) that contain CUI shall be marked so that recipients and handlers can identify the content as CUI. Use header/footer or cover sheet with at least: “CUI” and, where applicable, category or control designation per contract or organizational standard.
2. **Portions.** Where only portions of a document contain CUI, mark those portions (e.g., paragraph or section marking) or apply document-level marking. Ensure the overall document is not mistaken for non-CUI.
3. **Electronic files.** Apply marking to electronic files (e.g., in document properties, header, or filename convention) so that CUI is identifiable when stored or transmitted within the enclave.

### 4.2 Marking CUI in systems

1. **Folders and resources.** Within the Windows VM(s) and Azure resources, identify locations that store CUI using naming conventions, folder labels, or resource tags (e.g., “CUI” or “CUI- [category]”). This supports access control and handling (MAC-SOP-247).
2. **Databases and applications.** Where CUI is stored in databases or applications, use metadata, labels, or access boundaries so that CUI is identifiable and access is restricted to authorized users.

### 4.3 Handling standards

1. **Access.** Only authorized users (per access control and MAC-SOP-221) may access CUI. Access is enforced by Entra ID, Azure RBAC, and VM/application controls. Users shall not share CUI with unauthorized persons or place CUI on unauthorized systems.
2. **Storage.** CUI at rest shall remain within the enclave boundary (Azure Government, Windows VM(s)). No CUI on removable media unless an exception is documented per MAC-POL-213.
3. **Transmission.** CUI in transit shall be protected (e.g., TLS, approved VPN). Do not send CUI via unencrypted email or to systems outside the boundary. See MAC-SOP-244 for information transfer controls.
4. **Destruction.** When CUI is no longer needed, destroy or sanitize per Media Sanitization Procedure (MAC-SOP-246) and Records Retention Policy.

### 4.4 Training and awareness

1. **Personnel.** Personnel who create, handle, or have access to CUI shall complete training on CUI marking and handling (per awareness policy and MAC-FRM-204). Training shall cover marking requirements, handling rules, and reporting of mishandling.
2. **Review.** Review marking and handling practices at least annually; update procedure and training as contract or policy requirements change.

### 4.5 Evidence and records

1. **Evidence.** Retain samples or documentation of marking standards; training completion records; and (where applicable) logs of access to CUI. **Retention:** Minimum three (3) years per Records Retention Policy.

---

## 5. Roles and Responsibilities

- **Document owners / users:** Apply CUI markings to documents and data; handle CUI per this procedure and MAC-FRM-204.
- **System administrator:** Maintain system-level identification of CUI storage (tags, naming); enforce access control.
- **Security / Compliance:** Verify marking and handling during assessments; ensure alignment with MAC-POL-213 and contract requirements.

---

## 6. Evidence and Records

- CUI marking standard or template; samples of marked documents.
- Training completion and awareness records; access control documentation.
- **Retention:** Minimum three (3) years per Records Retention Policy.

---

## 7. Related Documents

- System Boundary and Scope for MacTech CUI Enclave (MAC-SCOPE-001)
- Media Handling & Data Disposal Policy (MAC-POL-213)
- Procedures for Media Sanitization (MAC-SOP-246)
- Procedures for CUI Media Handling and Transport (MAC-SOP-247)
- Procedures for Information Transfer Controls (MAC-SOP-244)
- Access Control Policy (MAC-POL-210)
- CUI Enclave User Agreement and Rules of Behavior (MAC-FRM-204)
- Records Retention Policy

---

## 8. Approval

This procedure is approved for use within the MacTech CUI enclave.

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Authorizing Official / CISO | _________________________ | _________________________ | __________ |
| Document Owner | _________________________ | _________________________ | __________ |
