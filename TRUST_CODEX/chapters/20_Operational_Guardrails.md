# Operational Guardrails

This chapter captures the operational “rules of the road” assessors routinely ask about.

## Control ownership

This pilot uses functional roles:
- **System Owner**: accountable for the system boundary and risk acceptance decisions. **Conclusive reference:** `docs/SYSTEM_OWNER_GUIDE.md`.
- **ISSO**: accountable for control design, evidence strategy, and assessment readiness.
- **IT Administrator**: accountable for day-to-day technical operation and evidence generation.
- **Compliance Officer**: accountable for governance artifacts and recordkeeping.

## Change-management triggers (pilot baseline)

Treat the following as “significant changes” that trigger:
- security impact analysis
- evidence regeneration
- and updates to mapping/evidence index as needed

Examples:
- Identity policy changes (MFA, conditional access, privileged roles)
- Network access path changes (VPN/RDP config, segmentation, NSGs)
- Logging pipeline changes (sources, retention, destinations)
- Cryptography configuration changes (FIPS mode, TLS settings)
- Any new data ingress/egress mechanism for CUI

## Evidence retention (pilot baseline)

- Technical evidence retention baseline: **1 year**
- Governance record retention baseline: **1 year**, unless a governing policy requires longer

## Time synchronization assumptions

- All enclave systems must synchronize time to an authoritative source.
- All logs must use consistent time (UTC preferred) to support correlation.

## Identity lifecycle boundaries

Identity lifecycle (joiner/mover/leaver) is enforced through:
- Entra ID identity governance (account creation, disablement, privileged role assignment)
- Operational procedures for approvals and review

## Incident escalation thresholds

Severity-based reporting baseline:
- **Critical**: ≤1 hour
- **High**: ≤4 hours
- **Medium/Low**: next business day

## What happens if a control temporarily fails

If a control degrades or fails:
- The event is logged and escalated (per incident thresholds where applicable)
- Compensating controls are applied where possible
- A POA&M item is created if the deficiency is not immediately corrected
- Evidence and mapping are updated to reflect current state (no “papering over”)

