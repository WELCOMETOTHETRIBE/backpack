# Where to Show the Auditor All Evidence on the VM

When an assessor RDPs to the enclave VM, direct them to **one location** for all evidence and the Codex narrative.

**Single source for validating every control:** The Trust Codex Manual **Auditor Manual** tab (formerly Controls) is the one place the auditor can go to validate everything for every control: status (SCTM), evidence type and artifact, vault location, where to view on VM (`C:\evidence\`), regeneration method, NIST exact text, and closeout guidance. Open the manual (e.g. `manual_app/index.html` or the embedded manual in CODEX_VIEWER) and use the **Auditor Manual** tab.

---

## Recommended: single folder for the auditor

**On the VM, use:**

```
C:\evidence\
```

### What the auditor sees there

| Item | Path on VM | Purpose |
|------|------------|---------|
| **Latest evidence bundle** | `C:\evidence\CUI-Evidence-<RunId>\` | All raw artifacts (e.g. rdp-policy.txt, secpol.cfg, defender-status.txt, hashes.sha256.txt). Open the **latest** RunId folder (highest timestamp). |
| **Latest validation report** | `C:\evidence\CUI-Validation-<RunId>\` | validation-report.txt, validation-report.json (39 checks, pass/fail). Same RunId as evidence. |
| **Auditor instructions** | `C:\evidence\README-for-auditor.txt` | Short “start here” instructions (copy from repo; see below). |
| **Trust Codex (optional)** | `C:\evidence\CODEX_VIEWER.html` | Offline Codex (Evidence Index, SCTM, chapters). Copy from `TRUST_CODEX/_build/CODEX_VIEWER.html` to the VM so the auditor can open it in a browser on the VM. |

So: **show the auditor `C:\evidence\`**. They open the latest `CUI-Evidence-<RunId>` for artifacts, the matching `CUI-Validation-<RunId>` for the validator result, and (if you copied it) `CODEX_VIEWER.html` for the Codex.

---

## Setup before the assessment

To **pull in everything from the Trust Codex Manual from within the VM** (scripts, CODEX_VIEWER, README-for-auditor) in one go, use the runbook **[PULL_TRUST_CODEX_INTO_VM.md](PULL_TRUST_CODEX_INTO_VM.md)**. Then:

1. **Run the collector** (if not already done):  
   `C:\hardening\codex-scripts\Run-CuiBulkEvidenceAndValidate.ps1 -OutRoot C:\evidence`

2. **Copy the auditor README** to the VM so it sits in `C:\evidence\`:
   - From repo: copy `TRUST_CODEX/vm-scripts/README-for-auditor.txt` to `C:\evidence\README-for-auditor.txt` on the VM (e.g. via RDP or SCP).

3. **Optional:** Copy the offline Codex viewer to the VM so the auditor can open it locally:
   - From your machine: copy `TRUST_CODEX/_build/CODEX_VIEWER.html` to `C:\evidence\CODEX_VIEWER.html` on the VM.  
   - Auditor opens it in Edge/Chrome on the VM (use a local HTTP server if opening file:// is problematic; see C3PAO_READINESS.md).

---

## Optional: network evidence vault

**Primary location for the auditor is `C:\evidence\` on the VM** (see above). If your organization also uses a network share for evidence, you can sync runs there:

- When the share is available at `\\EvidenceVault\CUI-Enclave`, you can sync and point the auditor there in addition to (or instead of) the VM.
- **Runs:** `\\EvidenceVault\CUI-Enclave\runs\<RunId>\raw\CUI-Evidence-<RunId>\`
- **Per-control bundles:** `\\EvidenceVault\CUI-Enclave\controls\<ControlId>\<RunId>\bundle.zip`

For a **VM-only** handoff, **`C:\evidence\`** is the single place to show the auditor all evidence for viewing on the VM.
