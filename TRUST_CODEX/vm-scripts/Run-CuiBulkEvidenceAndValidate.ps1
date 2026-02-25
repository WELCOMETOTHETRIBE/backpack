<#
Run-CuiBulkEvidenceAndValidate.ps1

One-command wrapper to generate a matched evidence + validation run.

- Runs the evidence collector (read-only) and the validation script (read-only)
- Uses a shared RunId so the directories align:
  - CUI-Evidence-<RunId>
  - CUI-Validation-<RunId>
#>

param(
  [string]$OutRoot = "C:\evidence"
)

$ErrorActionPreference = "Stop"

$runId = Get-Date -Format yyyyMMdd-HHmmss
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

$collect = Join-Path $here "Collect-Cui-Evidence.ps1"
$test = Join-Path $here "Test-CuiHardening.ps1"

Write-Host "RunId: $runId"
Write-Host "OutRoot: $OutRoot"
Write-Host ""

if (-not (Test-Path -LiteralPath $collect -PathType Leaf)) { throw "Missing: $collect" }
if (-not (Test-Path -LiteralPath $test -PathType Leaf)) { throw "Missing: $test" }

& $collect -OutRoot $OutRoot -RunId $runId

$evidenceDir = Join-Path $OutRoot "CUI-Evidence-$runId"
& $test -OutRoot $OutRoot -RunId $runId -EvidenceDir $evidenceDir

Write-Host ""
Write-Host "Done."
Write-Host "Evidence:  $evidenceDir"
Write-Host "Validation: $(Join-Path $OutRoot ("CUI-Validation-$runId"))"

