# Visitor Control Procedure

**Document ID:** MAC-SOP-249  
**Version:** 1.0  
**Effective date:** Upon approval  
**Classification:** Internal — CUI Enclave  
**Document owner:** CISO or designated System Owner  
**Approval authority:** CISO or designated Authorizing Official  
**Next review date:** Annually from effective date  
**Related NIST control:** SC.L2-3.10.3 (Control physical access to systems)

---

## Document control

| Version | Date | Description | Author |
|---------|------|-------------|--------|
| 1.0 | — | Initial release | — |

---

## 1. Purpose

This procedure defines how the MacTech CUI enclave controls physical access by visitors to areas where CUI is processed or to systems that process CUI, and how visitor activity is documented. It applies to the boundary in System Boundary and Scope (MAC-SCOPE-001). The enclave is primarily cloud-based (Azure Government, Windows VM(s)); this procedure addresses physical visitor control where MacTech or its designees control physical spaces (e.g., offices, colocation) that support CUI operations, and clarifies inherited controls for Azure Government facilities.

---

## 2. Scope

- **In scope:** Visitor sign-in/sign-out; identification and authorization of visitors; escort requirements; visitor access logs; physical areas under MacTech control where CUI is processed or displayed (e.g., workstations accessing the enclave); third-party or contractor visitors with potential access to CUI systems or areas.
- **Out of scope:** Day-to-day access by authorized personnel (governed by Physical Security Policy MAC-POL-212 and Physical Access Device Control MAC-SOP-236); visitor controls at Microsoft Azure Government datacenters (inherited from the cloud provider; documented for awareness).

---

## 3. Prerequisites

- Physical Security Policy (MAC-POL-212) in effect; designated personnel responsible for visitor control; visitor log (electronic or paper) and retention per Records Retention Policy.

---

## 4. Procedure

### 4.1 Visitor authorization and identification

1. **Pre-approval.** Visitors who may access areas where CUI is processed or systems that access CUI shall be pre-approved by the designated facility or security contact. Document the visitor’s name, organization, purpose, and expected duration before arrival where feasible.
2. **Identification.** Verify visitor identity using government-issued or other acceptable photo ID. Record visitor name, organization, and date/time of entry (and exit) in the visitor log.

### 4.2 Sign-in, sign-out, and escort

1. **Sign-in.** All visitors shall sign in upon entry to controlled areas (areas where CUI is processed or displayed). Log shall include: visitor name, company, purpose, host/sponsor name, date, time in.
2. **Sign-out.** Visitors shall sign out when leaving. Log shall include time out. Ensure visitors do not remain unescorted in CUI areas after their visit.
3. **Escort.** Visitors in areas where CUI is accessible (e.g., workstations that can access the CUI enclave, areas where CUI may be displayed) shall be escorted by an authorized employee unless an exception is documented (e.g., cleared contractor with need-to-know). Escort ensures visitors do not access CUI without authorization.

### 4.3 Visitor access log

1. **Content.** Maintain a visitor access log with at least: visitor name, organization, purpose, host/sponsor, date, time in, time out. Retain per Records Retention Policy (minimum three (3) years).
2. **Custody.** Designate who maintains the log and where it is stored; protect from unauthorized modification.

### 4.4 Cloud / Azure Government facility

1. **Inherited controls.** Physical access to Microsoft Azure Government datacenters is controlled by Microsoft. MacTech does not manage visitor control at those facilities. Document in the System Security Plan or boundary document that physical security of the cloud infrastructure is inherited from the provider.
2. **MacTech-controlled spaces.** Where MacTech personnel or contractors work in MacTech-controlled spaces (e.g., offices) and access the CUI enclave from those spaces, this procedure applies: visitors to those spaces shall sign in/out and be escorted when in areas where CUI can be accessed.

### 4.5 Review and verification

1. **Frequency.** Review visitor logs and escort practices at least annually; ensure visitor control is applied consistently.
2. **Evidence.** Retain visitor access logs and any visitor authorization records. **Retention:** Minimum three (3) years per Records Retention Policy.

---

## 5. Roles and Responsibilities

- **Facility/security or designated host:** Pre-approve visitors where required; verify identification; ensure sign-in/sign-out and escort; maintain visitor log.
- **Security / Compliance:** Verify visitor control during assessments; ensure alignment with MAC-POL-212.
- **All personnel:** Do not allow unescorted or unauthorized visitors in CUI areas; report suspicious or unauthorized access.

---

## 6. Evidence and Records

- Visitor access log (visitor name, organization, purpose, host, date, time in, time out).
- Documentation of inherited physical security for Azure Government (e.g., reference in SSP or boundary document).
- **Retention:** Minimum three (3) years per Records Retention Policy.

---

## 7. Related Documents

- System Boundary and Scope for MacTech CUI Enclave (MAC-SCOPE-001)
- Physical Security Policy (MAC-POL-212)
- Physical Access Device Control Procedure (MAC-SOP-236)
- Records Retention Policy

---

## 8. Approval

This procedure is approved for use within the MacTech CUI enclave.

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Authorizing Official / CISO | _________________________ | _________________________ | __________ |
| Document Owner | _________________________ | _________________________ | __________ |
