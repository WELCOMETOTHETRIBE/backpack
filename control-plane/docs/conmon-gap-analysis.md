# CMMC L2 CONMON Alignment and Gap Analysis

This document maps current capabilities to continuous monitoring expectations and identifies remaining gaps.

## Current strengths

### Evidence integrity & provenance
- Bundle integrity check: `BUNDLE.INTEGRITY` validates hashes + manifest.
- Validator identity: name/version/script SHA-256 stored per run.
- Inputs manifest: filenames + hashes + sizes + timestamps stored.
- Import idempotency: run fingerprint prevents duplicate runs.

### Scope truth
- One boundary per account.
- One cloud provider per boundary.
- Allocation engine never treats "service coverage" as "Inherited."

### Freshness (CONMON-ready behavior)
- Layer-based freshness policy with stale detection.
- Findings include freshness status and cutoff.
- Freshness summary highlights stale distribution and top stale layers.

## Typical CONMON expectations (practical)

1) Defined monitoring cadence by control family/layer  
2) Evidence of reviews (log review, vuln review, etc.)  
3) Drift detection (baseline vs current)  
4) Patch/vuln management cadence and proof  
5) Backup restore test cadence and proof  
6) Privilege governance cadence  

Your system supports 1) and much of 3) structurally; 2/4/5/6 can be added via additional validators and/or review artifacts.

## Remaining gaps & recommended increments

### Gap A: Control-level (not just layer-level) freshness
Add optional per-control overrides (org-configurable), keeping layer defaults as baseline.

### Gap B: Per-control "most recent evidence" across runs and sources
Compute synthesized status per control from its most recent finding, not just the latest run.

### Gap C: Drift events (pass→fail) and alerting
Persist drift events when a previously passing control fails in a new run.

### Gap D: Operational review artifacts
Add "review evidence" capture:
- log review attestations or tickets
- vulnerability scan review artifacts
- backup restore test logs/sign-offs

### Gap E: Trends & dashboard
Add timeline charts per layer:
- stale % over time
- fail % over time
- new failures since last run

## Suggested 90-day roadmap

1) Control-status synthesis endpoint (done via this pack)
2) Snapshot attestation chain (signature stored with snapshot)
3) Control-level freshness overrides + per-control recency merge
4) Drift event log + alerts
5) POA&M seeding from fail/stale/no-evidence for Customer/Shared controls
