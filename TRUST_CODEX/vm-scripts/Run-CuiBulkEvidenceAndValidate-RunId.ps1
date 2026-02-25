<#
Run-CuiBulkEvidenceAndValidate-RunId.ps1

Like Run-CuiBulkEvidenceAndValidate.ps1, but supports an explicit RunId so CI can:
- generate a RunId once
- pass it consistently to evidence + validation + vault sync + packaging
#>

param(
  [string]$OutRoot = "C:\evidence",
  [string]$RunId = ""
)

$ErrorActionPreference = "Stop"

$runId = if ($RunId) { $RunId } else { Get-Date -Format yyyyMMdd-HHmmss }
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

$collect = Join-Path $here "Collect-Cui-Evidence.ps1"
$test = Join-Path $here "Test-CuiHardening.ps1"
$test43 = Join-Path $here "Test-EnclaveEvidencePresence.ps1"

Write-Host "RunId: $runId"
Write-Host "OutRoot: $OutRoot"
Write-Host ""

if (-not (Test-Path -LiteralPath $collect -PathType Leaf)) { throw "Missing: $collect" }
if (-not (Test-Path -LiteralPath $test -PathType Leaf)) { throw "Missing: $test" }

& $collect -OutRoot $OutRoot -RunId $runId

$evidenceDir = Join-Path $OutRoot "CUI-Evidence-$runId"
& $test -OutRoot $OutRoot -RunId $runId -EvidenceDir $evidenceDir

if (Test-Path -LiteralPath $test43 -PathType Leaf) {
  & $test43 -OutRoot $OutRoot -RunId $runId -EvidenceDir $evidenceDir
} else {
  Write-Host "Test-EnclaveEvidencePresence.ps1 not found; skipping 43-control validation."
}

Write-Host ""
Write-Host "Done."
Write-Host "Evidence:  $evidenceDir"
Write-Host "Validation: $(Join-Path $OutRoot ("CUI-Validation-$runId"))"

