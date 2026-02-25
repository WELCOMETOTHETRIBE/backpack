# C3PAO Snuff Test — Per-Control Assessment

**Generated:** 2026-02-12T09:43:50.779352+00:00

Examine every control for assessor defensibility: validation alignment, evidence specificity, required fields, governance refs.

---

## Summary

| Result | Count |
|--------|-------|
| **PASS** | 110 |
| **WARN** | 0 |
| **FAIL** | 0 |
| **Total** | 110 |

---

## FAIL (must fix before claiming 100%)

---

## WARN (harden evidence or narrative)


---

## Remediation priorities

1. **FAIL controls:** Remediate validator failed checks (see `docs/TECHNICAL_GAPS_AND_VALIDATOR_ALIGNMENT.md`). Re-run evidence collection and validation; update SCTM/sctm-data so status reflects PASS only when validator agrees.
2. **Manual build:** Ensure `build_manual_data.py` merges `pilot_status` and `pilot_status_basis` from `sctm-data.json` when present so the Auditor Manual shows FAIL when the validator reports FAIL.
3. **WARN controls:** Add control-specific artifact names or implementation_summary for high-signal controls (e.g. AC.L2-3.1.3, AC.L2-3.1.10, AC.L2-3.1.11); add policy_sop_refs for governance controls.

## References

- `docs/TECHNICAL_GAPS_AND_VALIDATOR_ALIGNMENT.md` — RDP-REDIR, INACTIVITY, NTLM, AUTH-UX remediation
- `docs/EVIDENCE_RUNBOOK.md` — How to regenerate evidence and validation
- `tools/run_c3pao_snuff_test.py` — This script
