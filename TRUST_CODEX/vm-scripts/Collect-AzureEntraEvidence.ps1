<#
Collect-AzureEntraEvidence.ps1
Collects Azure/Entra artifacts for the 7 Azure/Entra controls (IA.L2-3.5.3, 3.5.4, 3.5.5, 3.5.6, MA.L2-3.7.5, SC.L2-3.13.10, SC.L2-3.13.5).

Design intent:
- Run on a machine with Azure CLI (az) installed and logged in (az login).
- Can run from Windows (VM or workstation) or from WSL/macOS (bash export_azure_evidence.sh).
- Writes into CUI-AzureEntra-<RunId> under OutRoot, or into an existing CUI-Evidence-<RunId>\azure-entra\.
- Conditional Access / MFA policy export is manual (portal); drop into folder or leave README.

Controls covered:
  IA.L2-3.5.3  MFA for privileged accounts (entra_tenant)
  IA.L2-3.5.4  Replay-resistant authentication (entra_tenant)
  IA.L2-3.5.5  Prevent identifier reuse (entra_tenant)
  IA.L2-3.5.6  Disable identifiers after inactivity (entra_tenant)
  MA.L2-3.7.5  MFA for nonlocal maintenance (entra_tenant)
  SC.L2-3.13.10 Cryptographic key management (azure_resource)
  SC.L2-3.13.5  Implement subnetworks (azure_resource)
#>

param(
  [string]$OutRoot = "C:\evidence",
  [string]$RunId = "",
  # Optional: merge into existing evidence bundle (e.g. C:\evidence\CUI-Evidence-20260213-123456)
  [string]$EvidenceDir = "",
  # Optional: Azure resource group for NSG export
  [string]$ResourceGroup = $env:AZURE_RG
)

$ErrorActionPreference = "Continue"

# Ensure Azure CLI (az) is on PATH if installed in default locations (installer may not have refreshed current session)
$azPaths = @(
  "$env:ProgramFiles\Microsoft SDKs\Azure\CLI2\wbin",
  "${env:ProgramFiles(x86)}\Microsoft SDKs\Azure\CLI2\wbin"
)
foreach ($p in $azPaths) {
  if (Test-Path -LiteralPath $p -PathType Container) {
    $env:PATH = "$p;$env:PATH"
    break
  }
}

New-Item -ItemType Directory -Path $OutRoot -Force | Out-Null
$ts = if ($RunId) { $RunId } else { Get-Date -Format "yyyyMMdd-HHmmss" }

$targetDir = $null
if ($EvidenceDir -and (Test-Path -LiteralPath $EvidenceDir -PathType Container)) {
  $azureSub = Join-Path $EvidenceDir "azure-entra"
  New-Item -ItemType Directory -Path $azureSub -Force | Out-Null
  $targetDir = $azureSub
} else {
  $targetDir = Join-Path $OutRoot "CUI-AzureEntra-$ts"
  New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}

$manifest = @{
  run_id       = $ts
  out_dir      = $targetDir
  collected_utc = (Get-Date).ToUniversalTime().ToString("o")
  controls     = @("IA.L2-3.5.3", "IA.L2-3.5.4", "IA.L2-3.5.5", "IA.L2-3.5.6", "MA.L2-3.7.5", "SC.L2-3.13.10", "SC.L2-3.13.5")
  artifacts    = @{}
}

function Write-Artifact {
  param([string]$Name, [string]$Content, [string]$Suffix = "txt")
  $path = Join-Path $targetDir "$Name.$Suffix"
  try {
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($path, $Content, $enc)
    $key = "$Name.$Suffix"
    if (-not $script:manifest.artifacts.ContainsKey($key)) { $script:manifest.artifacts[$key] = $path }
  } catch {
    "ERROR: $($_.Exception.Message)" | Out-File -FilePath $path -Encoding utf8
  }
}

# Check for Azure CLI (az)
$azAvailable = $false
try {
  $null = Get-Command az -ErrorAction Stop
  $azAvailable = $true
} catch { }

# If az is available, ensure user is logged in; prompt for interactive login if not
if ($azAvailable) {
  $null = az account show 2>$null
  $loggedIn = ($LASTEXITCODE -eq 0)
  if (-not $loggedIn) {
    Write-Host "Azure CLI is installed but you are not logged in."
    Write-Host "A browser or device-code sign-in will open so you can authenticate to Azure/Entra."
    $response = Read-Host "Run 'az login' now? (Y/n)"
    if ($response -eq "" -or $response -match "^\s*[yY]") {
      Write-Host "Running: az login"
      az login
      $null = az account show 2>$null
      $loggedIn = ($LASTEXITCODE -eq 0)
      if (-not $loggedIn) {
        Write-Warning "Login may have failed or was cancelled. Collection will continue but some artifacts may be empty."
      }
    } else {
      Write-Host "Skipping login. Collection will run; some artifacts may be empty if not authenticated."
    }
  }
}

if (-not $azAvailable) {
  $readme = @"
Azure/Entra evidence collection — Azure CLI (az) not found.

To collect artifacts for the 7 Azure/Entra controls:
1. Install Azure CLI: https://learn.microsoft.com/en-us/cli/azure/install-azure-cli
2. Run: az login
3. Re-run this script, or from repo root run:
   export RUN_ID=$ts OUT_DIR=$($targetDir -replace '\\','/')
   TRUST_CODEX/tools/export_azure_evidence.sh

Manual steps (see docs/EVIDENCE_RUNBOOK.md):
- Entra sign-in logs: Microsoft Entra ID -> Monitoring -> Sign-in logs -> Download (CSV)
- Conditional Access / MFA: Entra -> Protection -> Conditional Access -> export or screenshot
- Save files into this folder and re-run Test-AzureEntraControls.ps1.

Controls: IA.L2-3.5.3, IA.L2-3.5.4, IA.L2-3.5.5, IA.L2-3.5.6, MA.L2-3.7.5, SC.L2-3.13.10, SC.L2-3.13.5
"@
  Write-Artifact -Name "README" -Content $readme
  $manifest | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $targetDir "manifest.json") -Encoding utf8
  Write-Host "Azure CLI not found. Wrote README. Place manual exports in: $targetDir"
  exit 0
}

# Role assignments
try {
  $roleJson = az role assignment list --all -o json 2>$null
  if (-not $roleJson) { $roleJson = "[]" }
  Write-Artifact -Name "role-assignments-all" -Content $roleJson -Suffix "json"
  $roleTxt = az role assignment list --all -o table 2>$null
  if ($roleTxt) { Write-Artifact -Name "role-assignments-all" -Content $roleTxt -Suffix "txt" }
} catch { }

# Entra sign-in list (may require preview / permissions)
try {
  $signinJson = az ad signin list --top 500 -o json 2>$null
  if (-not $signinJson) { $signinJson = "[]" }
  Write-Artifact -Name "entra-signin" -Content $signinJson -Suffix "json"
  $signinTxt = az ad signin list --top 500 -o table 2>$null
  if ($signinTxt) { Write-Artifact -Name "entra-signin" -Content $signinTxt -Suffix "txt" }
} catch { }

# NSG list and rules (if ResourceGroup set)
if ($ResourceGroup) {
  try {
    $nsgJson = az network nsg list -g $ResourceGroup -o json 2>$null
    if (-not $nsgJson) { $nsgJson = "[]" }
    Write-Artifact -Name "nsg-list" -Content $nsgJson -Suffix "json"
    $nsgNames = az network nsg list -g $ResourceGroup --query "[].name" -o tsv 2>$null
    if ($nsgNames) {
      foreach ($n in $nsgNames) {
        $safe = $n -replace '[^a-zA-Z0-9_-]',''
        $rules = az network nsg rule list --nsg-name $n --resource-group $ResourceGroup -o json 2>$null
        if ($rules) { Write-Artifact -Name "nsg-rules-$safe" -Content $rules -Suffix "json" }
      }
    }
  } catch { }
}

# Key Vault list (SC.L2-3.13.10 - cryptographic key management)
try {
  $kvList = az keyvault list -o json 2>$null
  if (-not $kvList) { $kvList = "[]" }
  Write-Artifact -Name "keyvault-list" -Content $kvList -Suffix "json"
} catch { }

# Manifest
$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $targetDir "manifest.json") -Encoding utf8

Write-Host "Collected Azure/Entra evidence to: $targetDir"
Write-Host "Run Test-AzureEntraControls.ps1 -AzureEntraDir '$targetDir' to validate the 7 controls."
