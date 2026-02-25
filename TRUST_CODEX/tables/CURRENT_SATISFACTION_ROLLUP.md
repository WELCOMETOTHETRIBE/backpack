# Current Satisfaction Rollup (pilot; conservative)

This rollup is intentionally conservative and assessment-safe. It distinguishes:
- **Evidenced now**: evidence artifacts exist on the pilot VM (or in this repo) and are referenced explicitly.
- **Documented now**: documented boundary / N/A rationale exists (not a technical control claim).
- **Planned**: evidence locations are placeholders (e.g., "to be implemented").

Reference (explanatory context only): [NIST SP 800-171 Rev.3 (May 2024)](https://doi.org/10.6028/NIST.SP.800-171r3).

## Counts

| Bucket | Total controls | Evidenced now | Documented now | Planned | Other |
|---|---:|---:|---:|---:|---:|
| Class A | 80 | 20 | 0 | 60 | 0 |
| Class B | 18 | 0 | 0 | 17 | 1 |
| Inherited | 5 | 0 | 0 | 5 | 0 |
| Not Applicable | 7 | 0 | 7 | 0 | 0 |

## Notes (avoid overclaiming)

- “Evidenced now” here means the evidence index points to a concrete VM artifact. It does not automatically mean the control is fully satisfied in the target Azure/Entra/Bastion architecture.
- Azure/Entra/Bastion evidence is still required for identity/MFA, privileged access governance, and managed access-point claims.
- Governance (Class B) satisfaction requires records (training, reviews, incident handling/testing).
