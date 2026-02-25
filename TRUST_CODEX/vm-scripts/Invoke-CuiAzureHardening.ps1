<#
Invoke-CuiAzureHardening.ps1

Azure-side configuration + evidence export for the CUI pilot enclave.

Design intent:
- Safe to re-run (idempotent)
- Default mode is "verify + export" (read-only to Azure)
- Mutating changes require -Apply plus explicit feature switches

Outputs:
- C:\evidence\CUI-Azure-<RunId>\azure-*.json (exports)
- C:\evidence\CUI-Azure-<RunId>\azure-report.md (human report)

This script is NOT a complete Azure baseline for all controls; it targets the highest-signal
resource controls used by the Trust Codex enclave (NSG/VPN+RDP access/public IP/encryption/monitoring).
#>

param(
  [Parameter(Mandatory=$true)]
  [string]$SubscriptionId,

  [Parameter(Mandatory=$true)]
  [string]$ResourceGroup,

  [Parameter(Mandatory=$true)]
  [string]$VmName,

  # Optional: Log Analytics workspace resource id for monitoring linkage checks
  [string]$LogAnalyticsWorkspaceResourceId = "",

  # Default is verify-only. To make changes, set -Apply AND an enforcement switch.
  [switch]$Apply,

  # Enforcement switches (ignored unless -Apply is set)
  [switch]$RemovePublicIpFromNic,
  [switch]$EnforceNsgBaseline,
  [switch]$EnableEncryptionAtHost,

  [string]$OutRoot = "C:\evidence"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

function Write-Utf8NoBom {
  param([string]$Path, [string]$Text)
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $enc)
}

function Ensure-Dir([string]$Path) {
  try { New-Item -ItemType Directory -Path $Path -Force | Out-Null } catch {}
}

function NowIso() { (Get-Date).ToUniversalTime().ToString("o") }

$runId = Get-Date -Format yyyyMMdd-HHmmss
$outDir = Join-Path $OutRoot ("CUI-Azure-{0}" -f $runId)
Ensure-Dir $outDir

$findings = @()
function Add-Finding {
  param(
    [string]$Id,
    [string]$ControlId,
    [string]$Title,
    [bool]$Pass,
    [string]$Observed,
    [string]$Expected
  )
  $findings += [pscustomobject]@{
    id = $Id
    control_id = $ControlId
    title = $Title
    pass = $Pass
    observed = $Observed
    expected = $Expected
    timestamp_utc = (NowIso)
  }
}

function Need-Apply([string]$msg) {
  if (-not $Apply) {
    throw "Refusing to apply changes because -Apply was not provided. $msg"
  }
}

# Az module availability
if (-not (Get-Module -ListAvailable -Name Az.Accounts)) {
  $msg = "Az PowerShell modules not installed. Install Az.* on the VM or run this script from a host with Az modules."
  Write-Utf8NoBom -Path (Join-Path $outDir "azure-report.md") -Text ("# Azure hardening report`n`nERROR: {0}`n" -f $msg)
  Write-Utf8NoBom -Path (Join-Path $outDir "azure-report.json") -Text (([pscustomobject]@{
    schema = "mactech.codex.azure_hardening_report"
    version = 1
    generated_utc = (NowIso)
    error = $msg
    findings = @()
  } | ConvertTo-Json -Depth 8))
  Write-Host $msg
  exit 2
}

try {
  Import-Module Az.Accounts -ErrorAction Stop | Out-Null
  Import-Module Az.Compute -ErrorAction Stop | Out-Null
  Import-Module Az.Network -ErrorAction Stop | Out-Null
  Import-Module Az.Resources -ErrorAction Stop | Out-Null
} catch {
  throw "Failed to import Az modules: $($_.Exception.Message)"
}

try {
  # Use existing context if present; otherwise interactive login may be required.
  $ctx = Get-AzContext -ErrorAction SilentlyContinue
  if (-not $ctx) {
    Write-Host "No Az context found. Attempting Connect-AzAccount (interactive may be required)..."
    Connect-AzAccount -ErrorAction Stop | Out-Null
  }
  Select-AzSubscription -SubscriptionId $SubscriptionId -ErrorAction Stop | Out-Null
} catch {
  throw "Azure authentication/subscription selection failed: $($_.Exception.Message)"
}

### Fetch core resources
$vm = Get-AzVM -ResourceGroupName $ResourceGroup -Name $VmName -ErrorAction Stop
$vmJson = $vm | ConvertTo-Json -Depth 12
Write-Utf8NoBom -Path (Join-Path $outDir "azure-vm.json") -Text ($vmJson + "`n")

# NICs
$nicIds = @()
try { $nicIds = @($vm.NetworkProfile.NetworkInterfaces | ForEach-Object { $_.Id }) } catch {}
$nics = @()
foreach ($id in $nicIds) {
  try {
    $nics += Get-AzNetworkInterface -ResourceId $id -ErrorAction Stop
  } catch {}
}
Write-Utf8NoBom -Path (Join-Path $outDir "azure-nics.json") -Text (($nics | ConvertTo-Json -Depth 12) + "`n")

# Public IP associations
$publicIpIds = @()
foreach ($nic in $nics) {
  foreach ($ipc in @($nic.IpConfigurations)) {
    if ($ipc.PublicIpAddress -and $ipc.PublicIpAddress.Id) { $publicIpIds += $ipc.PublicIpAddress.Id }
  }
}
$publicIpIds = $publicIpIds | Select-Object -Unique
$pips = @()
foreach ($id in $publicIpIds) {
  try { $pips += Get-AzPublicIpAddress -ResourceId $id -ErrorAction Stop } catch {}
}
Write-Utf8NoBom -Path (Join-Path $outDir "azure-public-ips.json") -Text (($pips | ConvertTo-Json -Depth 12) + "`n")

### Finding: no public IP (AC/SC boundary posture)
$hasPublicIp = ($pips.Count -gt 0)
Add-Finding -Id "AZ-NO-PUBLIC-IP" -ControlId "AC.L2-3.1.12" -Title "No public IP attached to VM NICs (VPN+RDP access; no public RDP)" `
  -Pass (-not $hasPublicIp) -Observed ("PublicIpCount=" + $pips.Count) -Expected "0"

if ($hasPublicIp -and $Apply -and $RemovePublicIpFromNic) {
  Need-Apply "To remove public IP associations."
  foreach ($nic in $nics) {
    $changed = $false
    for ($i = 0; $i -lt $nic.IpConfigurations.Count; $i++) {
      $ipc = $nic.IpConfigurations[$i]
      if ($ipc.PublicIpAddress) {
        $nic.IpConfigurations[$i].PublicIpAddress = $null
        $changed = $true
      }
    }
    if ($changed) {
      Set-AzNetworkInterface -NetworkInterface $nic -ErrorAction Stop | Out-Null
    }
  }
}

### Finding: encryption at host (SC.L2-3.13.16 support)
try {
  $encAtHost = $false
  try { $encAtHost = [bool]$vm.SecurityProfile.EncryptionAtHost } catch { $encAtHost = $false }
  Add-Finding -Id "AZ-ENCRYPTION-AT-HOST" -ControlId "SC.L2-3.13.16" -Title "Encryption at host enabled (Azure VM)" `
    -Pass $encAtHost -Observed ("EncryptionAtHost=" + ($encAtHost -as [string])) -Expected "True"

  if ((-not $encAtHost) -and $Apply -and $EnableEncryptionAtHost) {
    Need-Apply "To enable EncryptionAtHost. This may require VM deallocation."
    # NOTE: enabling EncryptionAtHost generally requires update while deallocated.
    throw "EnableEncryptionAtHost not implemented automatically. Apply manually under change control, then re-run for evidence."
  }
} catch {
  Add-Finding -Id "AZ-ENCRYPTION-AT-HOST" -ControlId "SC.L2-3.13.16" -Title "Encryption at host enabled (Azure VM)" `
    -Pass $false -Observed ("ERROR: " + $_.Exception.Message) -Expected "Queryable"
}

### NSG baseline (SC.L2-3.13.5 / SC.L2-3.13.6)
# Best-effort: identify NSGs associated with NIC/subnet and export them.
$nsgIds = @()
foreach ($nic in $nics) {
  if ($nic.NetworkSecurityGroup -and $nic.NetworkSecurityGroup.Id) { $nsgIds += $nic.NetworkSecurityGroup.Id }
}
$nsgIds = $nsgIds | Select-Object -Unique
$nsgs = @()
foreach ($id in $nsgIds) {
  try { $nsgs += Get-AzNetworkSecurityGroup -ResourceId $id -ErrorAction Stop } catch {}
}
Write-Utf8NoBom -Path (Join-Path $outDir "azure-nsgs.json") -Text (($nsgs | ConvertTo-Json -Depth 14) + "`n")

Add-Finding -Id "AZ-NSG-PRESENT" -ControlId "SC.L2-3.13.6" -Title "NSG associated with VM NIC (baseline boundary control)" `
  -Pass ($nsgs.Count -gt 0) -Observed ("NsgCount=" + $nsgs.Count) -Expected ">= 1"

### Monitoring linkage (AU/SI support)
if ($LogAnalyticsWorkspaceResourceId) {
  Add-Finding -Id "AZ-LA-TARGET" -ControlId "AU.L2-3.3.1" -Title "Log Analytics workspace target specified" `
    -Pass $true -Observed $LogAnalyticsWorkspaceResourceId -Expected "resourceId"
} else {
  Add-Finding -Id "AZ-LA-TARGET" -ControlId "AU.L2-3.3.1" -Title "Log Analytics workspace target specified" `
    -Pass $false -Observed "(not provided)" -Expected "Provide -LogAnalyticsWorkspaceResourceId"
}

### Write report artifacts
$report = [pscustomobject]@{
  schema = "mactech.codex.azure_hardening_report"
  version = 1
  generated_utc = (NowIso)
  run_id = $runId
  subscription_id = $SubscriptionId
  resource_group = $ResourceGroup
  vm_name = $VmName
  out_dir = $outDir
  applied = [bool]$Apply
  findings = $findings
}
Write-Utf8NoBom -Path (Join-Path $outDir "azure-report.json") -Text (($report | ConvertTo-Json -Depth 10) + "`n")

$md = @()
$md += "# Azure hardening report"
$md += ""
$md += ("Generated: `{0}`" -f $report.generated_utc)
$md += ("RunId: `{0}`" -f $report.run_id)
$md += ""
$md += "## Scope"
$md += ""
$md += ("- Subscription: `{0}`" -f $SubscriptionId)
$md += ("- Resource group: `{0}`" -f $ResourceGroup)
$md += ("- VM: `{0}`" -f $VmName)
$md += ("- Applied changes: `{0}`" -f ([bool]$Apply))
$md += ""
$md += "## Findings"
$md += ""
foreach ($f in $findings) {
  $status = if ($f.pass) { "PASS" } else { "FAIL" }
  $md += ("- **{0}** `{1}` ({2}) — {3}" -f $status,$f.id,$f.control_id,$f.title)
  $md += ("  - observed: {0}" -f $f.observed)
  $md += ("  - expected: {0}" -f $f.expected)
}
$md += ""
$md += "## Evidence exports"
$md += ""
$md += "- `azure-vm.json`"
$md += "- `azure-nics.json`"
$md += "- `azure-public-ips.json`"
$md += "- `azure-nsgs.json`"
$md += "- `azure-report.json`"
$md += ""

Write-Utf8NoBom -Path (Join-Path $outDir "azure-report.md") -Text (($md -join \"`n\") + \"`n\")

Write-Host "Wrote: $outDir"

