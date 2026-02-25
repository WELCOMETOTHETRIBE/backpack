<#
Run-AzureEntraCollectAndValidate.ps1
One-command wrapper to collect and validate the 7 Azure/Entra controls.

- Runs Collect-AzureEntraEvidence.ps1 (requires Azure CLI when available)
- Runs Test-AzureEntraControls.ps1 against the collected folder
- Uses a shared RunId. Optionally merges into an existing CUI-Evidence-<RunId> (e.g. after Run-CuiBulkEvidenceAndValidate.ps1).

Usage:
  .\Run-AzureEntraCollectAndValidate.ps1
  .\Run-AzureEntraCollectAndValidate.ps1 -OutRoot C:\evidence -ResourceGroup myResourceGroup
  .\Run-AzureEntraCollectAndValidate.ps1 -EvidenceDir C:\evidence\CUI-Evidence-20260213-123456
#>

param(
  [string]$OutRoot = "C:\evidence",
  # Optional: merge Azure/Entra artifacts into this evidence bundle (e.g. CUI-Evidence-<RunId>)
  [string]$EvidenceDir = "",
  [string]$ResourceGroup = $env:AZURE_RG,
  # Run Invoke-AzureEntra7Hardening.ps1 first (Key Vault + NSG safe), then collect + validate
  [switch]$RunHardening
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

$runId = Get-Date -Format "yyyyMMdd-HHmmss"
$collect = Join-Path $here "Collect-AzureEntraEvidence.ps1"
$test = Join-Path $here "Test-AzureEntraControls.ps1"

if (-not (Test-Path -LiteralPath $collect -PathType Leaf)) { throw "Missing: $collect" }
if (-not (Test-Path -LiteralPath $test -PathType Leaf)) { throw "Missing: $test" }

Write-Host "RunId: $runId"
Write-Host "OutRoot: $OutRoot"
if ($EvidenceDir) { Write-Host "EvidenceDir (merge into): $EvidenceDir" }
if ($ResourceGroup) { Write-Host "ResourceGroup (NSG): $ResourceGroup" }
if ($RunHardening) { Write-Host "RunHardening: Yes (Key Vault + NSG)" }
Write-Host ""

# Optional: harden the 2 fixable controls (Key Vault if none, NSG deny RDP from 0.0.0.0/0)
if ($RunHardening -and $ResourceGroup) {
  $harden = Join-Path $here "Invoke-AzureEntra7Hardening.ps1"
  if (Test-Path -LiteralPath $harden -PathType Leaf) {
    Write-Host "Running Azure/Entra 7 hardening (Key Vault + NSG)..."
    & $harden -ResourceGroup $ResourceGroup -OutRoot $OutRoot -Apply
    Write-Host ""
  } else {
    Write-Warning "Invoke-AzureEntra7Hardening.ps1 not found; skipping hardening."
  }
}

# Collect
$collectParams = @{ OutRoot = $OutRoot; RunId = $runId }
if ($EvidenceDir) { $collectParams["EvidenceDir"] = $EvidenceDir }
if ($ResourceGroup) { $collectParams["ResourceGroup"] = $ResourceGroup }
& $collect @collectParams

# Resolve Azure/Entra folder for validation
$azureEntraDir = $null
if ($EvidenceDir -and (Test-Path -LiteralPath $EvidenceDir -PathType Container)) {
  $sub = Join-Path $EvidenceDir "azure-entra"
  if (Test-Path -LiteralPath $sub -PathType Container) { $azureEntraDir = $sub }
}
if (-not $azureEntraDir) {
  $azureEntraDir = Join-Path $OutRoot "CUI-AzureEntra-$runId"
  if (-not (Test-Path -LiteralPath $azureEntraDir -PathType Container)) {
    $azureEntraDir = $null
  }
}

# Validate
if ($azureEntraDir) {
  & $test -OutRoot $OutRoot -RunId $runId -AzureEntraDir $azureEntraDir
} else {
  & $test -OutRoot $OutRoot -RunId $runId
}

Write-Host ""
Write-Host "Done."
Write-Host "Azure/Entra artifacts: $azureEntraDir"
Write-Host "Validation report: $(Join-Path $OutRoot "CUI-Validation-AzureEntra-$runId\validation-report-azure-entra.txt")"
