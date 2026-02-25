# Shared Responsibility Matrix (SRM) — structured for clean handover

This SRM is designed to be **auditor-defensible**: it defines the **agreement between the Cloud Provider and the Recipient**, the **recipient’s acknowledgements** (including CUI boundary and User Access Form), and the **control boundary** with Inherited and N/A attestations.

---

## 1. Parties and roles

| Party | Role | Description |
|-------|------|-------------|
| **MacTech Solutions** | **Cloud Provider (CUI vault)** | Provides the CUI vault platform, infrastructure, and platform-level security within the provider boundary. Retains provider attestations and evidence (e.g. SOC, compliance certifications) as required for inherited controls. |
| **Recipient** | **Customer / System owner / Attestee** | The organization or designated system owner that operates the enclave deployment. Responsible for enclave configuration, identity/access, hardening, logging, governance, and evidence retention. Responsible for upholding the CUI boundary and all requirements that apply within the customer boundary. |

**Assessment framework:** NIST SP 800-171 Rev.2 / CMMC Level 2.  
**Deployment:** Customer enclave (e.g. Windows VM) on Azure; CUI vault and platform services provided by MacTech Solutions.

---

## 2. Provider–recipient agreement

**MacTech Solutions**, as the **Cloud Provider for the CUI vault**, and the **Recipient** agree to the following:

1. **Boundary**  
   The provider is responsible for platform/infrastructure security and attestations within the **provider boundary**. The recipient is responsible for **all enclave configuration and operation** within the **customer boundary**, including identity and authentication, network rules, OS hardening, logging and monitoring, governance (policies/SOPs, training, incident response), and evidence retention.

2. **Shared and inherited controls**  
   For controls designated **Inherited**, the provider satisfies the requirement (or its physical/platform portion); the recipient retains provider evidence and proof of boundary review. For **Shared** controls, the recipient must configure, enable, monitor, and retain evidence per the SRM.

3. **Evidence and handover**  
   Both parties retain evidence per this SRM. The recipient uses the Trust Codex Manual **SRM module** to verify inherited boundaries, attest N/A applicability, and produce a signed SRM acknowledgement artifact (e.g. under `C:\evidence\CUI-SRM-Ack-*`) for clean handover to an assessor.

4. **User Access Form**  
   Access to the CUI enclave and vault is contingent on the **User Access Form** (User Agreement and Rules of Behavior). The recipient ensures all users complete and comply with that form and its expectations (see **Recipient acknowledgements** below).

---

## 3. Recipient acknowledgements (clean handover)

By using the SRM module and signing the SRM review and N/A attestation, the **Recipient (Attestee)** acknowledges:

1. **CUI boundary and requirements**  
   It is the Recipient’s responsibility to **uphold the CUI boundary** and **all security and compliance requirements** that apply to the enclave and to CUI handled within that boundary.

2. **User Access Form and expectations**  
   The Recipient has reviewed and will enforce the **User Access Form** (CUI Enclave User Agreement, Rules of Behavior, and Acceptable Use — **MAC-FRM-204** or equivalent). The Recipient acknowledges that:
   - Access is contingent on completion and compliance with that form.
   - The form sets forth expectations for CUI handling, boundary compliance, acceptable use, incident reporting, and re-acknowledgement (e.g. annually and on material policy change).
   - The SRM does not reduce user or recipient obligations; users and the Recipient remain responsible for compliant handling of CUI and secure use of the enclave.

3. **SRM boundary and evidence**  
   The Recipient has verified the **Shared Responsibility Matrix** boundary (provider vs customer), has recorded or will record **provider and customer evidence references** for inherited controls, and will retain the **SRM review and N/A attestation** as part of the evidence package for assessor handover.

4. **Sign-off**  
   The SRM review signature and N/A attestation in the Manual constitute the Recipient’s formal acknowledgement of the above for the current assessment period and scope.

---

## 4. Definitions (use consistently)

- **Provider / platform:** MacTech Solutions (CUI vault and platform); Microsoft Azure for underlying infrastructure where applicable.
- **Recipient / customer / attestee:** The system owner operating this enclave deployment.
- **Inherited:** The provider satisfies the requirement within the provider boundary; the recipient retains provider evidence plus proof of boundary review.
- **Shared:** The provider provides baseline platform features; the recipient must configure, enable, monitor, and retain evidence.
- **N/A:** The requirement is not applicable to this enclave scope; the recipient attests with a documented justification.

---

## 5. Boundary statement (canonical)

The enclave runs on infrastructure and platform services provided by **MacTech Solutions** (and, where applicable, Microsoft Azure). The **provider** is responsible for physical datacenter security and platform operations within the cloud provider boundary. The **recipient** remains responsible for:

- identity and authentication configuration (tenant, roles, administrative access paths)
- network rules and segmentation (NSGs, firewalls, VPN/RDP access)
- OS hardening and local security configuration
- logging, monitoring, alerting, and log review
- governance controls, policies/SOPs, training, incident response, and evidence retention

---

## 6. What makes an inherited claim defensible

An inherited or shared claim is valid only if **all** of the following are true:

1. **Control boundary is explicit** (provider vs customer).
2. **Responsibility is assigned** (Provider / Recipient / Shared) for each control.
3. **Evidence expectations are defined** for both sides.
4. **Evidence is retained** (provider snapshots + recipient configuration exports + SRM review record).
5. **SRM review and N/A attestation are signed** (initial + annual + per material change) by the Recipient (Attestee).

---

## 7. Provider evidence (minimum)

Retain a timestamped snapshot of provider attestations relevant to inherited controls, e.g.:

- SOC or audit reports for services in scope
- Compliance certifications relevant to the framework
- Service documentation describing platform security responsibilities

**Retention:** At least one snapshot per assessment period and after any material scope or platform change.

---

## 8. Recipient evidence (minimum)

Retain evidence that the Recipient executed its responsibilities, e.g.:

- Configuration exports (NSG, VPN/RDP, VM, disk encryption, monitoring)
- Enclave hardening and validation reports
- Operational records (log review, incident response tests, change approvals)
- **SRM review record and acknowledgements** (from the SRM module export)
- **User Access Form** completion and re-acknowledgement records (per MAC-FRM-204 or equivalent)

---

## 9. SRM workflow in the Manual

Use the Manual App **SRM module** to:

1. **Load** the latest Azure inheritance report (if used) under `C:\evidence\CUI-Azure-Inheritance-*`.
2. **Inherited controls:** For each, verify the responsibility statement and record provider/recipient evidence references (paths or document IDs). Then **Sign SRM review**.
3. **N/A controls:** Confirm the N/A decision applies to this enclave scope, acknowledge the rationale, and **Sign N/A attestation**.
4. **Export** the SRM acknowledgement artifact to `C:\evidence` (e.g. `CUI-SRM-Ack-*`) for clean handover.

**Reference documents:**  
- User Access Form / Rules of Behavior: **MAC-FRM-204** (or equivalent).  
- Governance/Inherited/N-A narrative: **chapters/11_Governance_Inherited_and_NA_Controls.md**.

---

## 10. Non-negotiables

- We do **not** claim recipient responsibilities are satisfied by provider attestations alone.
- We do **not** claim “inherited” without retained provider evidence and a signed SRM review record.
- We do **not** claim N/A without a written justification tied to scope/boundary.
- We do **not** grant access without User Access Form completion and adherence to its expectations.
