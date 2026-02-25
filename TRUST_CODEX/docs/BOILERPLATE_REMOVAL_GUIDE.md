# Boilerplate Removal Guide (Adjudicated Documents)

For C3PAO readiness, governance documents must not contain template or placeholder text.

**Status:** Bulk removal has been completed (script run 2026-02-21). All governance docs under `governance/` have had the template header block and Document Control placeholders removed; remaining "[To be completed]" in contact/authorized-official fields were replaced with blank placeholders; "This template is signed using..." was replaced with the adjudicated approval-record sentence.

## Standard replacements

### 1. Remove template header block

**Find (at top of file):**
```markdown
# PLATFORM-AGNOSTIC TEMPLATE (REFERENCE ONLY)

**Source file:** `...`

**Status:** This is a *sanitized, platform-agnostic template copy* ...
**Rules for reuse** ...

---

# Actual Document Title
```

**Replace with:**
```markdown
# Actual Document Title
```

*(Already done: MAC-POL-210, MAC-FRM-204.)*

### 2. Document Control block

**Find:**
```markdown
**Reviewed By:** [To be completed]  
**Approved By:** [To be completed]  
**Next Review Date:** [To be completed]
```

**Replace with:**
```markdown
**Reviewed By:** ________________________  
**Approved By:** ________________________  
**Next Review Date:** ________________________  
*(Complete at document approval.)*
```

*(Already done: MAC-POL-210, MAC-FRM-204.)*

### 3. Optional: "This template is signed using..." paragraph

**Find:**  
`This template is signed using the **Trust Codex Manual** Governance workflow.`

**Replace with:**  
`Approval record is maintained via the Trust Codex Manual Governance workflow (per-document sign-off under C:\evidence\CUI-Doc-Signoff-* or central app).`

### 4. Policy-specific placeholders

- **MAC-POL-215 (Incident Response):** Replace `Phone: [To be completed]`, `Escalation: [To be completed]`, and any `[To be completed]` in the contact section with actual contacts or "—" until filled.
- **MAC-POL-210:** Lockout and 9.2 consistency already fixed.
- **Hosting:** Replace "hosting environment (historical)" with "Microsoft Azure" (or your actual provider) where the document describes the adjudicated system.

## Bulk script

To re-run or apply the same edits to new files:

```bash
cd TRUST_CODEX && python3 tools/remove_governance_boilerplate.py
```

The script removes the PLATFORM-AGNOSTIC TEMPLATE block and replaces Document Control `[To be completed]` in all `.md` files under `governance/`. The "This template is signed using..." paragraph was replaced globally via sed.

## Next steps

Fill in Document Control (Reviewed By, Approved By, Next Review Date) and any contact/authorized-official blanks at document approval time.
