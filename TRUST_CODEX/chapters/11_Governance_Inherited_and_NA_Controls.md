# Governance-Satisfied, Inherited, and Not Applicable Controls

This chapter explains why some requirements are **not** “system-enforced” and how compliance is demonstrated safely.

Companion references:
- `tables/CONTROL_MAPPING_800-171R2.md` (explicit 110-row mapping)
- `tables/EVIDENCE_INDEX.md` (per-control evidence)
- `tables/CLASS_B_INHERITED_NA_SATISFACTION.md` (assessor-safe per-control statements)

NIST SP 800-171 Rev.3 (May 2024) is referenced as explanatory context (not the controlling requirement set for this Rev.2 mapping): [NIST SP 800-171r3](https://doi.org/10.6028/NIST.SP.800-171r3).

## Governance-satisfied controls (Class B)

Some requirements are fundamentally about governance and human processes (e.g., training, personnel screening, incident response governance). For those:
- The primary evidence is the policy/SOP plus records (completion logs, review logs, approvals).
- The system may support the process (e.g., generating logs), but does not replace human accountability.

### What “governance-satisfied” means here

Governance-satisfied (Class B) means:
- The control intent cannot be honestly represented as “enforced by configuration alone.”
- The primary proof is **records of action** (training completion, reviews, approvals, test results), not configuration exports.
- The system’s role is supportive (logging, access controls, and telemetry inputs).

### Governance control families in this pilot

The mapping currently places most requirements in these families under Class B:
- **AT (Awareness and Training)**: training and awareness delivery + retained completion records.
- **IR (Incident Response)**: documented response capability + tests + incident tracking and reporting.
- **PS (Personnel Security)**: screening and personnel action governance (joiner/mover/leaver).
- **CA (Security Assessment)**: assessment scheduling, POA&M governance, continuous monitoring records.

In addition, certain “governance elements” appear inside otherwise technical families (examples):
- **AC 3.1.4 (Separation of duties)**: governance establishes role separation and compensating reviews; the system supports via RBAC and auditability.
- **AU 3.3.3 (Log review)**: the system produces logs; the review activity is a governed process with retained evidence of review.
- **CM 3.4.3/3.4.4 (Change control / impact analysis)**: approvals and impact analysis are governance; the system supports by restricting who can change what and by producing configuration evidence.

## Inherited controls

Some requirements (notably aspects of **physical security**) are inherited from the cloud provider. Inherited controls must be documented with:
- Clear responsibility boundaries (provider vs MacTech)
- Where provider evidence is obtained (attestations/certifications)
- What MacTech must still configure and operate

### Azure inheritance (how we keep it assessor-safe)

When we state “inherited” we also state:
- **Inherited from Azure**: datacenter physical security and facility access controls for the hosted infrastructure.
- **Still MacTech responsibility**: identity configuration, enclave hardening, network segmentation, logging/monitoring, operational processes, and evidence retention.

Evidence expectation:
- Provider attestations (stored and versioned) for inherited claims
- MacTech configuration/evidence for all non-inherited responsibilities
See `tables/EVIDENCE_INDEX.md` for the inherited-evidence entries.

## Not applicable (N/A)

Some requirements can be legitimately N/A given the pilot architecture (e.g., controls tied to organizational wireless infrastructure if none exists in-scope).

N/A must be:
- Explicit
- Narrowly justified
- Linked to the boundary statement

### How N/A is handled (to avoid “hand-waving”)

An N/A determination is treated as an evidence-bearing statement:
- It is written down with a rationale tied to the boundary and design defaults.
- It is re-evaluated when the boundary changes.
- It is supported by technical conditions that keep the requirement out of scope (e.g., “no in-scope wireless,” “no removable media workflows,” “no VoIP in scope”).

See:
- `chapters/02_CUI_Boundary_and_Data_Handling.md` (boundary statement)
- `tables/CLASS_B_INHERITED_NA_SATISFACTION.md` (per-control N/A justifications)

