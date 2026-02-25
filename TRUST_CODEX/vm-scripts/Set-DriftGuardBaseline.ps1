<#
Set-DriftGuardBaseline.ps1

Sets the Continuous Drift Guard baseline from the latest validation run under C:\evidence.
Copy the most recent CUI-Validation-*\validation-report.json to C:\evidence\drift_guard\baseline\.
#>

param(
  [string]$EvidenceRoot = "C:\evidence"
)

$ErrorActionPreference = "Stop"

$driftRoot = Join-Path $EvidenceRoot "drift_guard"
$baselineDir = Join-Path $driftRoot "baseline"

$validationDirs = Get-ChildItem -LiteralPath $EvidenceRoot -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match '^CUI-Validation-\d{8}-\d{6}$' } |
  Sort-Object Name -Descending

$latest = $validationDirs | Select-Object -First 1
if (-not $latest) {
  Write-Error "No CUI-Validation-* folder found under $EvidenceRoot. Run evidence + validation first (e.g. Run-CuiBulkEvidenceAndValidate.ps1)."
  exit 1
}

$reportPath = Join-Path $latest.FullName "validation-report.json"
if (-not (Test-Path -LiteralPath $reportPath -PathType Leaf)) {
  Write-Error "Validation report not found: $reportPath"
  exit 1
}

$runId = $latest.Name -replace '^CUI-Validation-', ''

if (-not (Test-Path -LiteralPath $baselineDir -PathType Container)) {
  New-Item -ItemType Directory -Force -Path $baselineDir | Out-Null
}

Copy-Item -LiteralPath $reportPath -Destination (Join-Path $baselineDir "validation-report.json") -Force
Set-Content -LiteralPath (Join-Path $baselineDir "run_id") -Value $runId -Encoding UTF8

# Append to drift guard audit log (same file the manual server uses).
$logPath = Join-Path $driftRoot "drift_guard.log"
try {
  if (-not (Test-Path -LiteralPath $driftRoot -PathType Container)) { New-Item -ItemType Directory -Force -Path $driftRoot | Out-Null }
  $ts = [DateTime]::UtcNow.ToString('o')
  Add-Content -LiteralPath $logPath -Value "$ts script=Set-DriftGuardBaseline run_id=$runId baseline_dir=$baselineDir"
} catch {}

Write-Output "Baseline set from run $runId"
Write-Output "  Baseline: $baselineDir\validation-report.json"
