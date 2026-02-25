# Evidence Closeout Workflow

Use this workflow for **System-Enforced (Class A)** controls and any control where you must attach technical artifacts.

## Closeout definition

A control is “closed out” when an assessor can trace:

- **Control ID** → **evidence artifacts** → **pass/fail basis** → **retention/cadence**

## Steps

1. **Collect evidence (read-only)**
   - Run the evidence collector(s) referenced in your environment.
   - Export policies/config/state (do not change settings).

2. **Capture GUI screenshots when CLI is partial**
   - If a control cannot be proven purely from CLI output, capture the required screenshots.
   - Store them next to the CLI artifacts for that control.

3. **Normalize & label artifacts**
   - Use consistent naming and include timestamps.
   - Keep per-control evidence together.

4. **Integrity protect (hash/sign)**
   - Hash artifacts (and/or sign) to demonstrate integrity.
   - Store hashes alongside artifacts.

5. **Store evidence**
   - Place evidence at the location specified in the Evidence Index.
   - Ensure access controls match the boundary.

6. **Write assessor notes**
   - What you ran, what you saw, and why it passes.
   - Record exceptions and compensating measures if any.

## Typical artifacts

- CLI output logs
- Exported policy files
- Screenshots for GUI-only checks
- Validation reports (when available)
- Hash manifest

