# Assessor Readiness Playbook (what is shown vs described)

This chapter is a practical guide for interviews and walkthroughs. It is written to avoid overclaiming.

## Guiding principle

For each requirement:
- Show **system evidence** when the system enforces the control (Class A).
- Show **governance records** when the organization governs the control (Class B).
- Clearly state what is **inherited** and what remains **MacTech responsibility**.

## What to show (examples)

- Identity enforcement: Entra ID conditional access policies, MFA settings, privileged role assignments, and sign-in logs.
- Access path control: VPN + RDP to VM; NSG rules and Entra sign-in logs (no public RDP).
- OS hardening: configuration baselines and verification outputs.
- Logging: log source configuration, retention settings, and sample queries demonstrating completeness.

## What to describe (not “show”)

- Physical security of Azure datacenters (show provider attestations; do not pretend to operate datacenter controls).
- Governance processes that are human-led (training delivery, personnel screening) — show records, not system settings.

## Interview readiness: “hard questions” we answer directly

- Where is the CUI boundary and how is it enforced?
- How do you prevent data egress (removable media, redirection, uncontrolled copy)?
- What happens if logging breaks or time sync drifts?
- Who is accountable for each control family?
- How do you prove you did a thing (review, training, risk assessment) and when?

