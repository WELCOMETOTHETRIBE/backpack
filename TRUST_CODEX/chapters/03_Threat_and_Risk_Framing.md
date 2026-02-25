# Threat & Risk Framing (non-alarmist)

## Why we talk about threats

Threat discussion is used here for one reason: to make control intent understandable and to justify design decisions. This is not meant to be fear-based or speculative.

## Primary risks this pilot is designed to reduce

- **Unauthorized access to CUI**: account compromise, over-privileged access, weak authentication.
- **Uncontrolled data egress**: copying CUI to unmanaged devices or removable media.
- **Loss of auditability**: inability to reconstruct “who did what, when” during an investigation or assessment.
- **Configuration drift**: changes that undermine hardening or segmentation without detection.
- **Delayed response**: slow triage and containment of security-relevant events.

## Risk management posture

The governance bundle establishes:
- Annual risk assessments (plus ad-hoc for significant changes)
- Defined vulnerability scanning and remediation timelines
- POA&M tracking and review cadences

This pilot adds a technical posture designed to generate evidence with low ambiguity:
- Entra ID identity controls and privileged access governance
- VPN + RDP administrative access (no public RDP)
- Default prohibition on removable media and redirection

