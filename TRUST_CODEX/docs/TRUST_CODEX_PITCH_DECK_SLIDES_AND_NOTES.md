# MacTech Trust Codex — CMMC Accelerator & CUI Vault Enclave  
## Pitch Deck: Verbatim Slide Text and Narrator Notes

Use this document to build the PowerPoint. Each section is one slide: **Slide title**, **Slide body (verbatim)**, and **Narrator notes (verbatim)**.

---

## Slide 1: Title

**Slide title:**  
MacTech Trust Codex — CMMC Accelerator & CUI Vault Enclave

**Slide body:**  
*[No body text — title only.]*

**Narrator notes:**  
“This deck is about why government contractors need a dedicated CUI environment and how MacTech’s Trust Codex and CUI Vault Enclave get small businesses to full CMMC 2.0 Level 2 compliance in under one week.”

---

## Slide 2: The New Reality for Government Contractors

**Slide title:**  
The New Reality for Government Contractors

**Slide body:**  
- Government contracting now requires **specific handling** of Controlled Unclassified Information (CUI) under **NIST SP 800-171**.
- CMMC 2.0 Level 2 is the standard; it maps to **110 requirements** across **14 domains**.
- No compliance means no contract — and ad‑hoc setups mean audit failure and rework.

**Narrator notes:**  
“Federal contracts are increasingly requiring CMMC 2.0 Level 2. That means your systems that touch CUI must satisfy NIST 800-171’s 110 controls. Doing it ad hoc leads to failed assessments and lost time. You need a purpose-built approach.”

---

## Slide 3: Why This Matters for Your Business

**Slide title:**  
Why This Matters for Your Business

**Slide body:**  
- **Win and retain** DoD and federal contracts that flow CUI.
- **Avoid** last-minute scrambles and failed C3PAO assessments.
- **Reduce risk** of data exposure and contractual noncompliance.
- **Accelerate** time-to-compliance so you can bid with confidence.

**Narrator notes:**  
“Compliance isn’t just a checkbox. It’s the difference between winning and losing contracts, and between passing or failing a third-party assessment. The goal is to get you compliant fast and keep you there.”

---

## Slide 4: The Problem for Small Businesses

**Slide title:**  
The Problem for Small Businesses

**Slide body:**  
- **110 controls** sound like a full-time program — and they can be, if you build from scratch.
- Scattered CUI on laptops and file shares = **unbounded scope** and **unmanageable evidence**.
- DIY compliance often means **months of effort**, inconsistent evidence, and **auditor pushback**.

**Narrator notes:**  
“Small teams don’t have a dedicated compliance staff. Trying to lock down every laptop and server that might touch CUI blows scope and makes evidence collection a nightmare. We solve that by putting CUI in one place.”

---

## Slide 5: The Solution — CUI Vault Enclave

**Slide title:**  
The Solution: CUI Vault Enclave

**Slide body:**  
- A **contained CUI handling environment** — one clear boundary for all CUI.
- **No CUI on general-purpose workstations** — access only through a controlled enclave (VPN + RDP to the vault VM).
- **Scoped for assessment**: one system, one evidence story, one handoff to the C3PAO.

**Narrator notes:**  
“The CUI Vault Enclave is a dedicated environment where CUI lives and is worked on. Your staff don’t handle CUI on their everyday laptops; they connect into the vault. That keeps scope small and evidence consistent.”

---

## Slide 6: What Is the Trust Codex?

**Slide title:**  
What Is the Trust Codex?

**Slide body:**  
- The **Trust Codex** is MacTech’s auditor-defensible, executive-readable, engineer-actionable manual for the CUI Pilot System.
- It maps **every one of the 110 NIST 800-171 Rev.2 requirements** to a control strategy and evidence.
- **Class A**: system-enforced, technically verifiable. **Class B**: governance, policy, and inherited or not-applicable, with clear justification.

**Narrator notes:**  
“The Trust Codex is the playbook. It tells you exactly how each of the 110 controls is satisfied — either by the system and technical evidence, or by policy and procedures. That’s what auditors and C3PAOs need to see.”

---

## Slide 7: NIST 800-171 — The 110 Controls

**Slide title:**  
NIST 800-171: The 110 Controls

**Slide body:**  
- CMMC 2.0 Level 2 is based on **NIST SP 800-171 Rev.2** — **110 requirements** in **14 domains** (Access Control, Awareness and Training, Audit and Accountability, Configuration Management, Identification and Authentication, Incident Response, Maintenance, Media Protection, Personnel Security, Physical Protection, Risk Assessment, Security Assessment, System and Communications Protection, System and Information Integrity).
- Government contracting now requires you to **implement and evidence** these controls wherever CUI is processed or stored.

**Narrator notes:**  
“Those 110 controls are the heart of CMMC Level 2. They cover who gets in, how you train people, how you log and audit, how you harden systems, and how you respond to incidents. The Trust Codex and the enclave are built to satisfy and evidence every one of them.”

---

## Slide 8: How We Satisfy the 110 — Class A and Class B

**Slide title:**  
How We Satisfy the 110: Class A and Class B

**Slide body:**  
- **Class A — System-Enforced (~90 controls):** Implemented in the enclave (OS, identity, network, crypto, logging). Evidence is **technical and reproducible** — scripts, configs, validation reports.
- **Class B — Governance / Inherited / N/A (~20 controls):** Policies, SOPs, training records, cloud provider inheritance, or justified non-applicability. **No policy-only claims** for technical controls.

**Narrator notes:**  
“We don’t claim everything is ‘technically enforced’ — we’re explicit. About 90 controls are satisfied by the system and evidence you can run and re-run. The rest are satisfied by governance and documentation, or marked not applicable with a clear reason.”

---

## Slide 9: CMMC Onboarding Acceleration — Under One Week

**Slide title:**  
CMMC Onboarding Acceleration: Under One Week

**Slide body:**  
- MacTech **Trust Codex plus VM deployment** delivers a **CMMC 2.0 Level 2–aligned CUI enclave** in **under one week**.
- Pre-built **governance bundle** (policies, procedures, templates), **hardened Windows Server 2025** enclave in Azure, and **evidence runbook** so you can collect and validate evidence on day one.
- **Small businesses** get a full control boundary and evidence program without building from zero.

**Narrator notes:**  
“Our promise: from kickoff to a compliant enclave and evidence-ready posture in under a week. You get the VM, the hardening, the governance docs, and the runbook. You’re not starting from a blank sheet — you’re stepping into a structure that’s already built for the 110 controls.”

---

## Slide 10: What You Get — The Enclave and the Codex

**Slide title:**  
What You Get: The Enclave and the Codex

**Slide body:**  
- **CUI Vault Enclave:** Windows Server 2025 Datacenter in **Microsoft Azure**. Access via **VPN + RDP** only; no public RDP. **Microsoft Entra ID** for identity and MFA. No removable media; USB and clipboard redirection disabled.
- **Trust Codex:** Control mapping, evidence index, runbook, validator, and per-control evidence bundles. **C3PAO-ready** layout: one place for the auditor to see every control and its evidence.

**Narrator notes:**  
“You get two things: the enclave itself — a locked-down Windows Server in Azure, with strict access and no loose endpoints — and the Codex, which is the manual and evidence package that shows an assessor exactly how each control is met and where the proof lives.”

---

## Slide 11: Evidence That Auditors Expect

**Slide title:**  
Evidence That Auditors Expect

**Slide body:**  
- **System Security Plan (SSP), POA&M, policies and procedures**, risk assessment, incident response plan, configuration and training records — all aligned to the **110 controls**.
- **Technical evidence:** Automated collection and validation (e.g. `Collect-Cui-Evidence`, `Test-CuiHardening`) produce timestamped bundles and **validation-report** (PASS/FAIL) so assessors can **examine and test** consistently.
- **Per-control bundles** and **evidence vault layout** so evidence is retrievable in under two minutes per control.

**Narrator notes:**  
“C3PAOs want to interview, examine, and test. We give them a clear evidence index, automated collection and validation, and per-control bundles. So when they ask for proof for control 3.1.1 or 3.13.11, you have a zip and a path — not a hunt through file shares.”

---

## Slide 12: Why CUI Vault — Scope and Speed

**Slide title:**  
Why CUI Vault: Scope and Speed

**Slide body:**  
- **Bounded scope:** CUI exists only in the enclave. Your assessment scope is **one system**, not every device that might have touched CUI.
- **Faster path to Level 2:** Pre-hardened VM, pre-mapped controls, and runbooks mean you spend time on **configuration and user onboarding**, not inventing controls.
- **Repeatable:** Same architecture and Codex can be reused for additional enclaves or contract boundaries.

**Narrator notes:**  
“The vault gives you a single boundary. That means one system to assess, one evidence story, and a repeatable model. You’re not chasing CUI across the company — you’re proving one enclave. That’s how you get to Level 2 in under a week instead of months.”

---

## Slide 13: Architecture at a Glance

**Slide title:**  
Architecture at a Glance

**Slide body:**  
- **Enclave:** Windows Server 2025 Datacenter (Azure). **Identity:** Entra ID (cloud-only), Entra-joined VMs. **Access:** VPN then RDP to the enclave VM; no public RDP.
- **Portable media:** None — USB mass storage and clipboard/drive redirection disabled. **Evidence:** 1-year retention baseline; roles (System Owner, ISSO, Compliance Officer, IT Admin); incident SLAs (e.g. Critical ≤1 hour, High ≤4 hours).

**Narrator notes:**  
“The architecture is simple by design: one or more VMs in Azure, joined to Entra, with no RDP exposed to the internet. Users connect over VPN and then RDP in. No USB, no clipboard copy-out. That’s how we keep the boundary tight and the evidence clean.”

---

## Slide 14: Call to Action

**Slide title:**  
Next Steps

**Slide body:**  
- **Scope your CUI:** Identify where CUI lives today and move it into a **CUI Vault Enclave**.
- **Deploy with MacTech:** Use the Trust Codex and VM deployment for **full CMMC 2.0 Level 2 alignment in under one week**.
- **Prepare for assessment:** Run the evidence runbook, maintain the Codex and governance, and hand off **C3PAO-ready** evidence when the assessor arrives.

**Narrator notes:**  
“Your next step is to stop treating CUI like regular data. Put it in a vault, run it under the Trust Codex, and use our deployment so you’re evidence-ready in under a week. When the C3PAO shows up, you’ll have one system, one story, and one set of evidence — not a company-wide scramble.”

---

## Slide 15: Contact / Close

**Slide title:**  
MacTech Trust Codex — CMMC Accelerator & CUI Vault Enclave

**Slide body:**  
- **Full CMMC 2.0 Level 2 compliance in under one week.**
- **110 NIST 800-171 controls.** One enclave. One evidence story.
- Contact MacTech for a demo or scoping discussion.

**Narrator notes:**  
“We’ve walked through why government contracting demands NIST 800-171, why you need a CUI vault and CMMC acceleration, and how MacTech’s Trust Codex and VM deployment get small businesses to full CMMC 2.0 Level 2 in under a week. Thank you — and we’re ready when you are.”

---

*End of verbatim slide text and narrator notes.*
