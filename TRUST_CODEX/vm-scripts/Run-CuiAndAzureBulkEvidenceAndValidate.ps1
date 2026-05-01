<#
Run-CuiAndAzureBulkEvidenceAndValidate.ps1

Unified one-command wrapper that produces both OS evidence and Azure/Entra
evidence under a single shared RunId, then validates both against their
respective rule sets. Output:

  C:\evidence\CUI-Evidence-<RunId>\           — OS hardening evidence (73 controls)
  C:\evidence\CUI-Evidence-<RunId>\azure-entra\ — Azure/Entra evidence (12 controls)
  C:\evidence\CUI-Validation-<RunId>\          — OS validation report
  C:\evidence\CUI-Validation-AzureEntra-<RunId>\ — Azure/Entra validation report

The two reports complement each other:
  - OS report: enclave hardening (73 STRONG/PARTIAL controls, see
    enclave-43-evidence-requirements.json + Test-CuiHardening.ps1)
  - Azure report: cloud-side controls validated by validate_azure_entra.py
    (12 controls: 3.1.13, 3.1.14, 3.5.3, 3.5.4, 3.5.5, 3.5.6, 3.7.5, 3.3.1,
    3.3.2, 3.13.5, 3.13.8, 3.13.10)

C3PAO assessors get both bundles; together they prove the full Azure-Gov +
Win 2025 enclave story end-to-end.

Usage:
  .\Run-CuiAndAzureBulkEvidenceAndValidate.ps1
  .\Run-CuiAndAzureBulkEvidenceAndValidate.ps1 -OutRoot C:\evidence -ResourceGroup rg-cui-pilot-envclave
  .\Run-CuiAndAzureBulkEvidenceAndValidate.ps1 -SkipAzure   # OS only (legacy behavior)
  .\Run-CuiAndAzureBulkEvidenceAndValidate.ps1 -SkipOs      # Azure only (already-collected OS bundle)

Prereqs:
  - Run from the VM (or any Windows machine) with Az CLI installed + az login
    completed when collecting Azure evidence.
  - Test-CuiHardening.ps1 and Test-AzureEntraControls.ps1 are in the same
    directory as this script.
#>

param(
  [string]$OutRoot = "C:\evidence",
  # Azure Resource Group for NSG export (defaults to environment AZURE_RG)
  [string]$ResourceGroup = $env:AZURE_RG,
  # Skip the OS half (use when you've already collected an OS bundle and just
  # need to add Azure evidence under the same RunId).
  [switch]$SkipOs,
  # Skip the Azure half (legacy: matches old Run-CuiBulkEvidenceAndValidate.ps1)
  [switch]$SkipAzure,
  # Run pre-collection hardening (Key Vault + NSG) before Azure collect
  [switch]$RunHardening
)

$ErrorActionPreference = "Stop"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$runId = Get-Date -Format "yyyyMMdd-HHmmss"

$collectOs   = Join-Path $here "Collect-Cui-Evidence.ps1"
$testOs      = Join-Path $here "Test-CuiHardening.ps1"
$collectAzure= Join-Path $here "Collect-AzureEntraEvidence.ps1"
$testAzure   = Join-Path $here "Test-AzureEntraControls.ps1"
$hardenAzure = Join-Path $here "Invoke-AzureEntra7Hardening.ps1"

if (-not $SkipOs) {
  if (-not (Test-Path -LiteralPath $collectOs -PathType Leaf)) { throw "Missing: $collectOs" }
  if (-not (Test-Path -LiteralPath $testOs    -PathType Leaf)) { throw "Missing: $testOs" }
}
if (-not $SkipAzure) {
  if (-not (Test-Path -LiteralPath $collectAzure -PathType Leaf)) { throw "Missing: $collectAzure" }
  if (-not (Test-Path -LiteralPath $testAzure    -PathType Leaf)) {
    Write-Warning "Test-AzureEntraControls.ps1 not found. Azure validation will be skipped (collection still runs)."
  }
}

Write-Host ""
Write-Host "─────────────────────────────────────────────────────────────────────"
Write-Host "  CUI Vault Evidence + Validation — unified runner"
Write-Host "─────────────────────────────────────────────────────────────────────"
Write-Host "  RunId:           $runId"
Write-Host "  OutRoot:         $OutRoot"
if ($ResourceGroup) { Write-Host "  Azure RG:        $ResourceGroup" }
Write-Host "  OS evidence:     $(if ($SkipOs)   { 'SKIPPED' } else { 'will collect + validate' })"
Write-Host "  Azure evidence:  $(if ($SkipAzure) { 'SKIPPED' } else { 'will collect + validate' })"
Write-Host "  Hardening pass:  $(if ($RunHardening) { 'will run before Azure collect' } else { 'skipped' })"
Write-Host "─────────────────────────────────────────────────────────────────────"
Write-Host ""

$evidenceDir = Join-Path $OutRoot "CUI-Evidence-$runId"

# ============================================================================
# Phase 1 — OS evidence + validation
# ============================================================================
if (-not $SkipOs) {
  Write-Host ""
  Write-Host "[1/2] OS hardening evidence — Collect-Cui-Evidence.ps1"
  & $collectOs -OutRoot $OutRoot -RunId $runId

  Write-Host ""
  Write-Host "[1/2] OS validation — Test-CuiHardening.ps1"
  & $testOs -OutRoot $OutRoot -RunId $runId -EvidenceDir $evidenceDir
}

# ============================================================================
# Phase 1.5 — Optional Azure hardening (Key Vault soft delete + NSG narrow)
# ============================================================================
if ($RunHardening -and (Test-Path -LiteralPath $hardenAzure -PathType Leaf)) {
  Write-Host ""
  Write-Host "[1.5/2] Azure hardening — Invoke-AzureEntra7Hardening.ps1"
  & $hardenAzure -ResourceGroup $ResourceGroup
}

# ============================================================================
# Phase 2 — Azure/Entra evidence + validation, merged into the OS RunId folder
# ============================================================================
if (-not $SkipAzure) {
  Write-Host ""
  Write-Host "[2/2] Azure/Entra evidence — Collect-AzureEntraEvidence.ps1"
  $azureArgs = @{
    OutRoot = $OutRoot
    RunId   = $runId
  }
  if ($ResourceGroup) { $azureArgs["ResourceGroup"] = $ResourceGroup }
  if (Test-Path -LiteralPath $evidenceDir -PathType Container) {
    $azureArgs["EvidenceDir"] = $evidenceDir
  }
  & $collectAzure @azureArgs

  if (Test-Path -LiteralPath $testAzure -PathType Leaf) {
    Write-Host ""
    Write-Host "[2/2] Azure/Entra validation — Test-AzureEntraControls.ps1"
    $azureSubDir = Join-Path $evidenceDir "azure-entra"
    if (Test-Path -LiteralPath $azureSubDir -PathType Container) {
      & $testAzure -AzureEntraDir $azureSubDir -OutRoot $OutRoot -RunId $runId
    } else {
      Write-Warning "Azure-entra subdir not found at $azureSubDir; validator skipped."
    }
  }
}

# ============================================================================
# Summary
# ============================================================================
Write-Host ""
Write-Host "─────────────────────────────────────────────────────────────────────"
Write-Host "  Done. RunId: $runId"
Write-Host "─────────────────────────────────────────────────────────────────────"
if (-not $SkipOs) {
  Write-Host "  OS evidence:        $evidenceDir"
  Write-Host "  OS validation:      $(Join-Path $OutRoot ('CUI-Validation-' + $runId))"
}
if (-not $SkipAzure) {
  Write-Host "  Azure evidence:     $(Join-Path $evidenceDir 'azure-entra')"
  Write-Host "  Azure validation:   $(Join-Path $OutRoot ('CUI-Validation-AzureEntra-' + $runId))"
}
Write-Host ""
Write-Host "Next: upload both validation report JSON files via Codex →"
Write-Host "      /dashboard/os-baselines/boundaries/<id> → 'Upload validator report'"
Write-Host "─────────────────────────────────────────────────────────────────────"
