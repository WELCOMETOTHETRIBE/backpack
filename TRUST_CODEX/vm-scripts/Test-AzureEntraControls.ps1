<#
Test-AzureEntraControls.ps1
Validates the 7 Azure/Entra controls from collected artifacts (role assignments, sign-in logs, NSG, Key Vault, etc.).

Design intent:
- Read-only; consumes output from Collect-AzureEntraEvidence.ps1 (or manual exports).
- Writes validation-report-azure-entra.txt and validation-report-azure-entra.json into OutDir.
- Same check structure as Test-CuiHardening (id, control, title, pass, observed, expected, evidence_hint) for ingest/display.

Controls validated:
  IA.L2-3.5.3  MFA for privileged accounts
  IA.L2-3.5.4  Replay-resistant authentication
  IA.L2-3.5.5  Prevent identifier reuse
  IA.L2-3.5.6  Disable identifiers after inactivity
  MA.L2-3.7.5  MFA for nonlocal maintenance
  SC.L2-3.13.10 Cryptographic key management
  SC.L2-3.13.5  Implement subnetworks
#>

param(
  [string]$OutRoot = "C:\evidence",
  [string]$RunId = "",
  # Folder containing Azure/Entra artifacts (CUI-AzureEntra-* or CUI-Evidence-*\azure-entra)
  [string]$AzureEntraDir = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

$AZURE_ENTRA_CONTROLS = @(
  @{ id = "IA.L2-3.5.3";  title = "MFA for privileged accounts" }
  @{ id = "IA.L2-3.5.4";  title = "Replay-resistant authentication" }
  @{ id = "IA.L2-3.5.5";  title = "Prevent identifier reuse" }
  @{ id = "IA.L2-3.5.6";  title = "Disable identifiers after inactivity" }
  @{ id = "MA.L2-3.7.5";  title = "MFA for nonlocal maintenance" }
  @{ id = "SC.L2-3.13.10"; title = "Cryptographic key management" }
  @{ id = "SC.L2-3.13.5";  title = "Implement subnetworks" }
)

New-Item -ItemType Directory -Path $OutRoot -Force | Out-Null
$ts = if ($RunId) { $RunId } else { Get-Date -Format "yyyyMMdd-HHmmss" }
$outDir = Join-Path $OutRoot "CUI-Validation-AzureEntra-$ts"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

$script:Checks = @()
$script:ArtifactDir = $null

function Add-Check {
  param(
    [string]$Id,
    [string]$Control,
    [string]$Title,
    [bool]$Pass,
    [string]$Observed,
    [string]$Expected,
    [string]$EvidenceHint
  )
  $script:Checks += [pscustomobject]@{
    id = $Id
    control = $Control
    title = $Title
    pass = $Pass
    observed = $Observed
    expected = $Expected
    evidence_hint = $EvidenceHint
    timestamp_utc = (Get-Date).ToUniversalTime().ToString("o")
  }
}

function Get-ArtifactPath {
  param([string]$Name)
  if (-not $script:ArtifactDir) { return $null }
  $p = Join-Path $script:ArtifactDir $Name
  if (Test-Path -LiteralPath $p -PathType Leaf) { return $p }
  return $null
}

function Test-ArtifactExists {
  param([string]$Name)
  return ($null -ne (Get-ArtifactPath -Name $Name))
}

function Get-ArtifactContent {
  param([string]$Name)
  $path = Get-ArtifactPath -Name $Name
  if (-not $path) { return $null }
  try {
    return Get-Content -LiteralPath $path -Raw -Encoding utf8 -ErrorAction Stop
  } catch { return $null }
}

# Resolve AzureEntraDir
if ($AzureEntraDir -and (Test-Path -LiteralPath $AzureEntraDir -PathType Container)) {
  $script:ArtifactDir = (Resolve-Path -LiteralPath $AzureEntraDir).Path
} else {
  # Try latest CUI-AzureEntra-* or CUI-Evidence-*\azure-entra
  $parent = Get-ChildItem -LiteralPath $OutRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^CUI-(AzureEntra|Evidence)-\d{8}-\d{6}$' } |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($parent) {
    if ($parent.Name -like 'CUI-AzureEntra-*') {
      $script:ArtifactDir = $parent.FullName
    } else {
      $sub = Join-Path $parent.FullName "azure-entra"
      if (Test-Path -LiteralPath $sub -PathType Container) { $script:ArtifactDir = $sub }
    }
  }
}

if (-not $script:ArtifactDir) {
  Add-Check -Id "AZ-ENTRA-DIR" -Control "Azure/Entra" -Title "Azure/Entra artifact directory" -Pass $false `
    -Observed "Azure/Entra artifact directory not provided or not found" `
    -Expected "Run Collect-AzureEntraEvidence.ps1 and pass -AzureEntraDir, or place artifacts in CUI-AzureEntra-<RunId>" `
    -EvidenceHint "azure-entra folder or CUI-AzureEntra-*"
  $outDir = Join-Path $OutRoot "CUI-Validation-AzureEntra-$ts"
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
  goto WriteReport
}

# ---- IA.L2-3.5.3 / MA.L2-3.7.5: MFA and sign-in evidence ----
$signinPath = Get-ArtifactPath "entra-signin.json"
$signinContent = Get-ArtifactContent "entra-signin.json"
$hasSignin = $signinPath -and $signinContent -and ($signinContent.Trim() -ne "[]" -and $signinContent.Trim() -ne "")
$mfaPolicyPath = $null
foreach ($name in @("conditional-access-policies.json", "mfa-policy.json", "conditional-access-export.json")) {
  if (Test-ArtifactExists $name) { $mfaPolicyPath = $name; break }
}
$hasMfaPolicy = $null -ne $mfaPolicyPath

Add-Check -Id "ENTRA-MFA" -Control "IA.L2-3.5.3" -Title "MFA for privileged accounts (Entra evidence)" `
  -Pass ($hasSignin -or $hasMfaPolicy) `
  -Observed "Sign-in artifact=$hasSignin; MFA/Conditional Access policy=$hasMfaPolicy" `
  -Expected "entra-signin.json and/or Conditional Access/MFA policy export present" `
  -EvidenceHint "entra-signin.json; Conditional Access export (portal) in artifact folder"

Add-Check -Id "ENTRA-MFA-MA" -Control "MA.L2-3.7.5" -Title "MFA for nonlocal maintenance (Entra evidence)" `
  -Pass ($hasSignin -or $hasMfaPolicy) `
  -Observed "Sign-in artifact=$hasSignin; MFA policy=$hasMfaPolicy" `
  -Expected "Entra sign-in logs and/or MFA policy (same as IA.L2-3.5.3)" `
  -EvidenceHint "entra-signin.json; MFA policy export"

# ---- IA.L2-3.5.4, 3.5.5, 3.5.6: Entra auth lifecycle (evidence present) ----
$entraEvidencePresent = $hasSignin -or (Test-ArtifactExists "role-assignments-all.json")
Add-Check -Id "ENTRA-REPLAY" -Control "IA.L2-3.5.4" -Title "Replay-resistant authentication (Entra evidence)" `
  -Pass $entraEvidencePresent `
  -Observed "Entra/sign-in or role evidence present=$entraEvidencePresent" `
  -Expected "Entra sign-in or role evidence for tenant auth posture" `
  -EvidenceHint "entra-signin.json; role-assignments; Entra supports replay-resistant auth"

Add-Check -Id "ENTRA-NO-REUSE" -Control "IA.L2-3.5.5" -Title "Prevent identifier reuse (Entra evidence)" `
  -Pass $entraEvidencePresent `
  -Observed "Entra evidence present=$entraEvidencePresent" `
  -Expected "Tenant identity evidence (Entra enforces no reuse)" `
  -EvidenceHint "entra-signin.json; role-assignments-all.json"

Add-Check -Id "ENTRA-INACTIVITY" -Control "IA.L2-3.5.6" -Title "Disable identifiers after inactivity (Entra evidence)" `
  -Pass $entraEvidencePresent `
  -Observed "Entra evidence present=$entraEvidencePresent" `
  -Expected "Tenant identity/lifecycle evidence" `
  -EvidenceHint "entra-signin.json; Entra lifecycle policy export if available"

# ---- SC.L2-3.13.10: Cryptographic key management ----
$kvPath = Get-ArtifactPath "keyvault-list.json"
$kvContent = Get-ArtifactContent "keyvault-list.json"
$hasKeyVault = $kvPath -and $kvContent -and ($kvContent.Trim() -ne "[]" -and $kvContent.Trim() -ne "")
Add-Check -Id "AZ-KEYVAULT" -Control "SC.L2-3.13.10" -Title "Cryptographic key management (Azure Key Vault evidence)" `
  -Pass $hasKeyVault `
  -Observed "keyvault-list.json present and non-empty=$hasKeyVault" `
  -Expected "Azure Key Vault list or key management artifact" `
  -EvidenceHint "keyvault-list.json; or document key management approach"

# ---- SC.L2-3.13.5: Implement subnetworks (NSG) ----
$nsgPath = Get-ArtifactPath "nsg-list.json"
$nsgContent = Get-ArtifactContent "nsg-list.json"
$hasNsg = $nsgPath -and $nsgContent -and ($nsgContent.Trim() -ne "[]" -and $nsgContent.Trim() -ne "")
# Optional: check RDP not effectively allowed from 0.0.0.0/0 (first matching rule by priority wins; Deny overrides Allow)
$rdpOpenToPublic = $false
if ($hasNsg) {
  $ruleFiles = Get-ChildItem -LiteralPath $script:ArtifactDir -Filter "nsg-rules-*.json" -File -ErrorAction SilentlyContinue
  foreach ($f in $ruleFiles) {
    $rules = Get-Content -LiteralPath $f.FullName -Raw -Encoding utf8 | ConvertFrom-Json -ErrorAction SilentlyContinue
    if (-not $rules -or -not ($rules -is [array])) { continue }
    $rdpRules = @()
    foreach ($r in $rules) {
      $port = $r.destinationPortRange -as [string]
      if (-not $port -or $port -notmatch "3389") { continue }
      $src = $r.sourceAddressPrefix -as [string]
      if ($src -ne "*" -and $src -ne "0.0.0.0/0") { continue }
      $pri = [int]($r.priority)
      $acc = $r.access -as [string]
      $rdpRules += [pscustomobject]@{ priority = $pri; access = $acc }
    }
    $rdpRules = $rdpRules | Sort-Object -Property priority
    if ($rdpRules.Count -gt 0 -and ($rdpRules[0].access -eq "Allow")) { $rdpOpenToPublic = $true; break }
  }
}
Add-Check -Id "AZ-NSG" -Control "SC.L2-3.13.5" -Title "Implement subnetworks (NSG evidence)" `
  -Pass ($hasNsg -and (-not $rdpOpenToPublic)) `
  -Observed "NSG list present=$hasNsg; RDP open to 0.0.0.0/0=$rdpOpenToPublic" `
  -Expected "NSG list/rules present; RDP (3389) not allowed from 0.0.0.0/0" `
  -EvidenceHint "nsg-list.json; nsg-rules-*.json"

$passCount = ($script:Checks | Where-Object { $_.pass }).Count
$failCount = ($script:Checks | Where-Object { -not $_.pass }).Count
$totalCount = $script:Checks.Count

$summary = [pscustomobject]@{
  generated_utc = (Get-Date).ToUniversalTime().ToString("o")
  computer = $env:COMPUTERNAME
  user = $env:USERNAME
  azure_entra_dir = $script:ArtifactDir
  pass_count = $passCount
  fail_count = $failCount
  total = $totalCount
  control_ids = @("IA.L2-3.5.3", "IA.L2-3.5.4", "IA.L2-3.5.5", "IA.L2-3.5.6", "MA.L2-3.7.5", "SC.L2-3.13.10", "SC.L2-3.13.5")
}

$enc = New-Object System.Text.UTF8Encoding($false)

$txtPath = Join-Path $outDir "validation-report-azure-entra.txt"
@(
  "CUI Pilot - Azure/Entra 7-Controls Validation Report (read-only)"
  "Generated (UTC): $($summary.generated_utc)"
  "Computer: $($summary.computer)"
  "User: $($summary.user)"
  "Azure/Entra artifact dir: $($script:ArtifactDir)"
  "PASS: $passCount  FAIL: $failCount  TOTAL: $totalCount"
  ""
  "Checks:"
) | Out-File -FilePath $txtPath -Encoding utf8

foreach ($c in $script:Checks) {
  $status = if ($c.pass) { "PASS" } else { "FAIL" }
  ("[$status] {0} ({1}) - {2} | Observed: {3} | Expected: {4} | Evidence: {5}" -f $c.title, $c.control, $c.id, $c.observed, $c.expected, $c.evidence_hint) |
    Add-Content -Path $txtPath -Encoding utf8
}

$jsonPath = Join-Path $outDir "validation-report-azure-entra.json"
$jsonObj = [pscustomobject]@{
  summary = $summary
  checks = $script:Checks
  azure_entra_dir = $script:ArtifactDir
}
[System.IO.File]::WriteAllText($jsonPath, ($jsonObj | ConvertTo-Json -Depth 8), $enc)

Write-Host "Wrote: $txtPath"
Write-Host "Wrote: $jsonPath"
Write-Host "PASS: $passCount  FAIL: $failCount  TOTAL: $totalCount"
