# Prompt for Slide Deck Builder: MacTech Trust Codex — CMMC Accelerator & CUI Vault Enclave

**Give this prompt to the person (or tool) building the PowerPoint.**

---

## Prompt (copy everything below this line)

---

Create a professional PowerPoint slide deck for **MacTech’s Trust Codex — CMMC Accelerator and CUI Vault Enclave**. The deck is a pitch for government contractors (especially small businesses) and should build the story in three parts: **what the vault is**, **why you need it**, and **how we make it simple, contained, and delivered seamlessly**.

### 1. What the vault is (big overview)

- The **CUI Vault Enclave** is a **single, contained environment** where all Controlled Unclassified Information (CUI) is stored and worked on. Think of it as a secure “room” in the cloud — one clear boundary.
- **No CUI on everyday laptops or file shares.** Staff access CUI only by connecting into the vault (e.g., VPN + remote desktop to a dedicated VM). That’s the whole scope: one system.
- It’s backed by the **Trust Codex** — a manual that maps every one of the **110 NIST 800-171** requirements (CMMC 2.0 Level 2) to how the enclave satisfies them and where the evidence lives. So the vault isn’t just infrastructure; it’s an **evidence-ready, auditor-friendly** CUI environment.

### 2. Why you need it

- **Government contracting now requires it.** Federal and DoD contracts increasingly mandate CMMC 2.0 Level 2 — meaning **NIST 800-171’s 110 controls** must be implemented and evidenced wherever CUI is processed or stored. No compliance often means no contract.
- **Scattered CUI is the enemy.** If CUI lives on random laptops and servers, assessment scope explodes and evidence is a mess. Auditors (C3PAOs) need a clear boundary and reproducible evidence. The vault gives you **one system, one story, one handoff**.
- **Speed and confidence.** Without a purpose-built approach, compliance can take months and still fail assessment. With a vault and accelerator, the message is: **full CMMC 2.0 Level 2 alignment in under one week** for small businesses.

### 3. How we make it simple, contained, and delivered seamlessly

- **Simple:** One boundary (the enclave). One control set (110, already mapped in the Codex). Pre-built governance (policies, procedures, templates) and a **runbook** so evidence collection and validation are repeatable, not ad hoc.
- **Contained:** Hardened VM (e.g., Windows Server in Azure), no public RDP, access only via VPN + RDP. Identity and MFA (e.g., Entra ID). No USB/clipboard redirection; no removable media. CUI stays inside the vault.
- **Delivered seamlessly:** MacTech delivers the **Trust Codex plus VM deployment** — the architecture, hardening, governance bundle, evidence index, and automation (e.g., evidence collection and validation scripts). You get a **turnkey CUI enclave** and the playbook to keep it compliant and assessment-ready. Small businesses don’t build from zero; they step into a structure that’s already built for the 110 controls.

### What the deck should do

- **Tell the story** in that order: What the vault is → Why you need it → How we make it simple, contained, and seamless.
- Use **clear, concise slide titles and bullets**; avoid jargon where possible, but it’s okay to use terms like CUI, CMMC 2.0 Level 2, NIST 800-171, and C3PAO when they’re part of the message.
- Include a **title slide**, a **closing/contact slide**, and **speaker notes** (narrator notes) for each slide so a presenter can deliver the pitch verbatim or in their own words.
- **Tone:** Confident, practical, and aimed at business owners and compliance leads who need to get (and stay) compliant fast without a huge internal team.

### Optional reference

- For **exact slide text and verbatim narrator notes** (15 slides), the builder can use: **TRUST_CODEX_PITCH_DECK_SLIDES_AND_NOTES.md** in the same docs folder. The prompt above is the strategic brief; that document is the line-by-line source for titles, body copy, and notes if the client wants to stick to script.

---

*End of prompt.*
