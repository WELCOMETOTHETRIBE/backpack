# Control Philosophy (and explicit non-claims)

## Why the “Class A / Class B” split exists

For CMMC Level 2, the assessment is anchored in NIST SP 800-171 requirements. Not every requirement is satisfied by technical configuration alone, and not every requirement is purely governance.

This Codex uses a two-class strategy to remain clear and defensible:

- **Class A — System-Enforced / Technical**  
  The system design and configuration enforce the requirement intent, and the system generates reproducible evidence.

- **Class B — Governance / Policy / Inherited / Not Applicable**  
  The requirement is satisfied through governance artifacts and human processes, cloud-inherited responsibility, or justified non-applicability. Evidence is governance artifacts and records—**not** system configuration output.

## Evidence rules

- **Governance text is not technical evidence.** A policy can require MFA; only configuration and authentication logs prove it is enforced.
- **Reproducibility matters.** Where a technical claim is made, there must be a repeatable method to re-generate evidence (command, script, configuration query, or exported report).

## Explicit non-claims (assessment safe)

This Trust Codex does **not** claim:
- CMMC certification or “CMMC-compliant” status.
- That all 110 requirements are technically enforced.
- That cloud provider inherited controls relieve MacTech of customer responsibilities (identity configuration, logging, hardening, monitoring, change control).

## Inheritance approach (Azure)

Inheritance will be explicitly documented where appropriate (e.g., Azure physical security). Inheritance statements must:
- Identify the inherited responsibility area
- Identify what MacTech still must configure/operate
- Identify where evidence is obtained (provider attestations + MacTech configuration artifacts)

