<#
Run-DriftGuardCheck.ps1

Runs evidence collection + validation, then copies the new validation report to
C:\evidence\drift_guard\last_check\ for comparison against the baseline.
Used by the Trust Codex Manual "Drift Guard" tab.
#>

param(
  [string]$EvidenceRoot = "C:\evidence",
  [string]$ScriptsRoot = ""
)

$ErrorActionPreference = "Stop"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ScriptsRoot) { $ScriptsRoot = $here }

$bulkScript = Join-Path $ScriptsRoot "Run-CuiBulkEvidenceAndValidate.ps1"
if (-not (Test-Path -LiteralPath $bulkScript -PathType Leaf)) {
  Write-Error "Missing: $bulkScript"
  exit 1
}

& $bulkScript -OutRoot $EvidenceRoot

$validationDirs = Get-ChildItem -LiteralPath $EvidenceRoot -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match '^CUI-Validation-\d{8}-\d{6}$' } |
  Sort-Object Name -Descending

$latest = $validationDirs | Select-Object -First 1
if (-not $latest) {
  Write-Error "No CUI-Validation-* folder found after run."
  exit 1
}

$reportPath = Join-Path $latest.FullName "validation-report.json"
if (-not (Test-Path -LiteralPath $reportPath -PathType Leaf)) {
  Write-Error "Validation report not found: $reportPath"
  exit 1
}

$runId = $latest.Name -replace '^CUI-Validation-', ''
$driftRoot = Join-Path $EvidenceRoot "drift_guard"
$lastCheckDir = Join-Path $driftRoot "last_check"

if (-not (Test-Path -LiteralPath $lastCheckDir -PathType Container)) {
  New-Item -ItemType Directory -Force -Path $lastCheckDir | Out-Null
}

Copy-Item -LiteralPath $reportPath -Destination (Join-Path $lastCheckDir "validation-report.json") -Force
Set-Content -LiteralPath (Join-Path $lastCheckDir "run_id") -Value $runId -Encoding UTF8

# Append to drift guard audit log (same file the manual server uses).
$logPath = Join-Path $driftRoot "drift_guard.log"
try {
  if (-not (Test-Path -LiteralPath $driftRoot -PathType Container)) { New-Item -ItemType Directory -Force -Path $driftRoot | Out-Null }
  $ts = [DateTime]::UtcNow.ToString('o')
  Add-Content -LiteralPath $logPath -Value "$ts script=Run-DriftGuardCheck run_id=$runId last_check_dir=$lastCheckDir"
} catch {}

Write-Output "Drift check complete. RunId: $runId"
Write-Output "  Last check: $lastCheckDir\validation-report.json"
