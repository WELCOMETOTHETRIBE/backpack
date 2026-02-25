<#
Invoke-AzureEntra7Hardening.ps1

Hardens the 2 Azure/Entra controls that can be fixed via CLI so collect+validate can show 5 PASS:
  SC.L2-3.13.10 — Ensure at least one Key Vault exists (create if none).
  SC.L2-3.13.5  — Ensure NSG rules do not allow RDP (3389) from 0.0.0.0/0 (add Deny rule if needed).

Uses Azure CLI (az); run after az login. Safe to re-run. Mutating changes require -Apply.

Usage:
  .\Invoke-AzureEntra7Hardening.ps1 -ResourceGroup myRg
  .\Invoke-AzureEntra7Hardening.ps1 -ResourceGroup myRg -Apply
#>

param(
  [string]$ResourceGroup = $env:AZURE_RG,
  [string]$Location = "",
  [string]$OutRoot = "C:\evidence",
  # Without -Apply, only reports what would be done
  [switch]$Apply
)

$ErrorActionPreference = "Continue"

if (-not $ResourceGroup) {
  Write-Host "ResourceGroup is required (or set env AZURE_RG). Used for NSG export and Key Vault creation."
  exit 2
}

# Check az
$azOk = $false
try { $null = Get-Command az -ErrorAction Stop; $azOk = $true } catch {}
if (-not $azOk) {
  Write-Host "Azure CLI (az) not found. Install and run az login."
  exit 2
}
$null = az account show 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Not logged in to Azure. Run: az login"
  exit 2
}

# Location for new Key Vault (default from RG)
if (-not $Location) {
  $Location = az group show -g $ResourceGroup --query location -o tsv 2>$null
  if (-not $Location) {
    Write-Host "Could not get location for resource group $ResourceGroup"
    exit 2
  }
}

$runId = Get-Date -Format "yyyyMMdd-HHmmss"
$reportDir = Join-Path $OutRoot "CUI-AzureEntra-Hardening-$runId"
New-Item -ItemType Directory -Path $reportDir -Force | Out-Null

$actions = @()
function Log-Action { param([string]$Msg, [string]$Done) $script:actions += [pscustomobject]@{ msg = $Msg; done = $Done } }

# ---- Key Vault (SC.L2-3.13.10) ----
$kvList = az keyvault list -o json 2>$null | ConvertFrom-Json -ErrorAction SilentlyContinue
$kvCount = if ($kvList -is [array]) { $kvList.Count } else { 0 }
if ($kvCount -eq 0) {
  if ($Apply) {
    $digits = ($runId -replace "[^0-9]", "")
$kvName = ("codex-cui-kv-" + $digits).Substring(0, [Math]::Min(24, 14 + $digits.Length))
    Write-Host "Creating Key Vault: $kvName in $ResourceGroup ($Location)"
    $out = az keyvault create --name $kvName --resource-group $ResourceGroup --location $Location -o json 2>&1
    if ($LASTEXITCODE -eq 0) {
      Log-Action -Msg "Create Key Vault for SC.L2-3.13.10" -Done "Created $kvName"
    } else {
      Log-Action -Msg "Create Key Vault" -Done "Failed: $out"
    }
  } else {
    Log-Action -Msg "Key Vault (SC.L2-3.13.10): none found" -Done "Would create one with -Apply"
  }
} else {
  Log-Action -Msg "Key Vault (SC.L2-3.13.10)" -Done "Already $kvCount vault(s); no change"
}

# ---- NSG: ensure no RDP from 0.0.0.0/0 (SC.L2-3.13.5) ----
$nsgNames = az network nsg list -g $ResourceGroup --query "[].name" -o tsv 2>$null
if ($nsgNames) {
  foreach ($nsgName in $nsgNames) {
    $nsgName = $nsgName.Trim()
    if (-not $nsgName) { continue }
    $rules = az network nsg rule list --nsg-name $nsgName --resource-group $ResourceGroup -o json 2>$null | ConvertFrom-Json -ErrorAction SilentlyContinue
    $rdpPublic = $false
    foreach ($r in @($rules)) {
      $dest = $r.destinationAddressPrefix
      if (-not $dest -and $r.destinationAddressPrefixes) { $dest = $r.destinationAddressPrefixes -join "," }
      $port = $r.destinationPortRange
      $acc = $r.access
      if (($dest -eq "0.0.0.0/0" -or $dest -eq "*") -and $port -and $port -match "3389" -and $acc -eq "Allow") {
        $rdpPublic = $true
        break
      }
    }
    if ($rdpPublic -and $Apply) {
      $denyRuleName = "Deny-RDP-From-Public-Codex"
      $priority = 100
      Write-Host "Adding deny rule $denyRuleName (priority $priority) to NSG $nsgName to block RDP from 0.0.0.0/0"
      $null = az network nsg rule create --resource-group $ResourceGroup --nsg-name $nsgName --name $denyRuleName --priority $priority --direction Inbound --access Deny --protocol Tcp --source-address-prefixes "0.0.0.0/0" --destination-address-prefixes "*" --destination-port-ranges 3389 2>&1
      if ($LASTEXITCODE -eq 0) {
        Log-Action -Msg "NSG $nsgName: block RDP from 0.0.0.0/0" -Done "Added $denyRuleName"
      } else {
        Log-Action -Msg "NSG $nsgName: add deny rule" -Done "Failed (may already exist or permission denied)"
      }
    } elseif ($rdpPublic) {
      Log-Action -Msg "NSG $nsgName: RDP from 0.0.0.0/0 allowed" -Done "Would add Deny rule with -Apply"
    } else {
      Log-Action -Msg "NSG $nsgName (SC.L2-3.13.5)" -Done "No RDP from 0.0.0.0/0; OK"
    }
  }
} else {
  Log-Action -Msg "NSG (SC.L2-3.13.5)" -Done "No NSGs in $ResourceGroup; set ResourceGroup to RG that has VM/NSGs"
}

# Report
$report = [pscustomobject]@{
  run_id         = $runId
  generated_utc  = (Get-Date).ToUniversalTime().ToString("o")
  resource_group = $ResourceGroup
  location       = $Location
  applied        = [bool]$Apply
  actions        = $actions
}
$reportPath = Join-Path $reportDir "hardening-report.json"
$report | ConvertTo-Json -Depth 5 | Set-Content -Path $reportPath -Encoding utf8
Write-Host "Report: $reportPath"
Write-Host "Done. Next: Run-AzureEntraCollectAndValidate.ps1 -ResourceGroup $ResourceGroup"
exit 0
