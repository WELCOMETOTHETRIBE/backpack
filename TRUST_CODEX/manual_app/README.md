# Trust Codex Manual App (interactive control adjudication)

This is a small, offline-friendly web app designed to run on the Windows VM and guide an assessor/operator **control-by-control** through evidence adjudication.

## What it does

- Loads `manual-data.json` (generated from SCTM + Evidence Index)
- Lets you filter/search controls
- Provides an adjudication checklist + notes per control
- Stores progress locally in the browser (localStorage)
- Exports/imports progress as a JSON artifact

## Files

- `index.html`: app shell
- `styles.css`: manual UI styling
- `app.js`: app logic (filters, checklist, persistence, export/import)
- `manual-data.json`: generated dataset consumed by the app
- `build_manual_data.py`: generator for `manual-data.json`
- `start-server.ps1`: local static server (no dependencies)

## Generate / refresh `manual-data.json` (developer workstation)

From the repo:

```bash
python3 TRUST_CODEX/manual_app/build_manual_data.py
```

That reads:
- `TRUST_CODEX/tables/SCTM_FULL_STATUS_LIST.csv`
- `TRUST_CODEX/tables/evidence-index.json` (canonical)
- `TRUST_CODEX/tables/EVIDENCE_INDEX.md` (human-readable; generated from canonical index)

And writes:
- `TRUST_CODEX/manual_app/manual-data.json`

## Run on the Windows VM

Copy `TRUST_CODEX/` to the VM (recommended target `C:\CODEX\TRUST_CODEX\`), then run:

```powershell
powershell -ExecutionPolicy Bypass -File C:\CODEX\TRUST_CODEX\manual_app\start-server.ps1
```

This serves from the `TRUST_CODEX` root so links to chapters/tables work, and opens:
- `http://127.0.0.1:8787/manual_app/index.html`

Stop the server with **Ctrl+C** in the PowerShell window.

## Export / import progress

- Use **Export progress** to download a JSON file (assessment artifact).
- Use **Import progress** to load the file back and continue.
- Use **Reset local progress** to wipe localStorage for this app/browser profile.

