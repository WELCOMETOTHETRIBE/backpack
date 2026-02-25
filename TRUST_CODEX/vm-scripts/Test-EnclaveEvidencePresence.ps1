<#
Test-EnclaveEvidencePresence.ps1
Validates the 43 enclave-enforced controls that have no configuration check in Test-CuiHardening.
Each control passes if either: (1) all required evidence files are present in the bundle, or
(2) it is design/NA and listed in enclave-scope-na.json in the evidence bundle.

Run after Collect-Cui-Evidence and Test-CuiHardening with the same -EvidenceDir and -RunId so
reports go to the same CUI-Validation-<RunId> folder.
#>

param(
  [string]$OutRoot = "C:\evidence",
  [string]$RunId = "",
  [string]$EvidenceDir = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

$script:Checks = @()
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

# Resolve evidence directory (same logic as Test-CuiHardening)
$resolvedEvidenceDir = $null
if ($EvidenceDir -and (Test-Path -LiteralPath $EvidenceDir -PathType Container)) {
  $resolvedEvidenceDir = (Resolve-Path -LiteralPath $EvidenceDir).Path
} else {
  $latest = Get-ChildItem -LiteralPath $OutRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like 'CUI-Evidence-*' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($latest) { $resolvedEvidenceDir = $latest.FullName }
}

$ts = if ($RunId) { $RunId } else { Get-Date -Format yyyyMMdd-HHmmss }
$outDir = Join-Path $OutRoot "CUI-Validation-$ts"
if (-not (Test-Path -LiteralPath $outDir -PathType Container)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

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

function Has-EvFile {
  param([string]$Name)
  if (-not $resolvedEvidenceDir) { return $false }
  $p = Join-Path $resolvedEvidenceDir $Name
  return (Test-Path -LiteralPath $p -PathType Leaf)
}

# Load 43-control requirements
$reqPath = Join-Path $here "enclave-43-evidence-requirements.json"
if (-not (Test-Path -LiteralPath $reqPath -PathType Leaf)) {
  Write-Warning "Missing $reqPath; skipping 43-control validation."
  exit 0
}
$reqJson = Get-Content -LiteralPath $reqPath -Raw -Encoding UTF8 | ConvertFrom-Json

# Load design/NA manifest from evidence bundle
$scopeNa = $null
$scopePath = Join-Path $resolvedEvidenceDir "enclave-scope-na.json"
if ($resolvedEvidenceDir -and (Test-Path -LiteralPath $scopePath -PathType Leaf)) {
  try {
    $scopeNa = Get-Content -LiteralPath $scopePath -Raw -Encoding UTF8 | ConvertFrom-Json
  } catch {
    $scopeNa = $null
  }
}
$designNaControlIds = @()
if ($scopeNa) {
  if ($scopeNa.controls) { foreach ($c in $scopeNa.controls) { if ($c.control_id) { $designNaControlIds += $c.control_id } } }
  if ($scopeNa.governance_attested) { foreach ($c in $scopeNa.governance_attested) { if ($c.control_id) { $designNaControlIds += $c.control_id } } }
}

foreach ($entry in $reqJson.controls) {
  $cid = $entry.control_id
  $title = $entry.title
  $checkId = "E43-" + ($cid -replace '\.', '-')

  if ($entry.PSObject.Properties.Name -contains "design_na" -and $entry.design_na) {
    $inManifest = $designNaControlIds -contains $cid
    $pass = $inManifest
    Add-Check -Id $checkId -Control $cid -Title $title `
      -Pass $pass `
      -Observed $(if ($inManifest) { "Listed in enclave-scope-na.json" } else { "Not listed in enclave-scope-na.json" }) `
      -Expected "Control listed in enclave-scope-na.json with reason (design/NA)" `
      -EvidenceHint "enclave-scope-na.json"
    continue
  }

  $requiredFiles = @()
  if ($entry.PSObject.Properties.Name -contains "required_files") {
    $requiredFiles = @($entry.required_files)
  }
  $missing = @()
  foreach ($f in $requiredFiles) {
    if (-not (Has-EvFile $f)) { $missing += $f }
  }
  $pass = ($missing.Count -eq 0)
  $observed = if ($missing.Count -eq 0) { "All required files present" } else { "Missing: " + ($missing -join ", ") }
  Add-Check -Id $checkId -Control $cid -Title $title `
    -Pass $pass `
    -Observed $observed `
    -Expected ("Required files: " + ($requiredFiles -join ", ")) `
    -EvidenceHint ($requiredFiles -join ", ")
}

$summary = [pscustomobject]@{
  generated_utc = (Get-Date).ToUniversalTime().ToString("o")
  computer = $env:COMPUTERNAME
  user = $env:USERNAME
  evidence_dir = $resolvedEvidenceDir
  pass_count = @($Checks | Where-Object pass).Count
  fail_count = @($Checks | Where-Object { -not $_.pass }).Count
  total = @($Checks).Count
}

$txtPath = Join-Path $outDir "validation-report-43-controls.txt"
@(
  "CUI Pilot — 43 enclave controls (evidence presence / design NA)"
  "Generated (UTC): $($summary.generated_utc)"
  "Evidence bundle: $resolvedEvidenceDir"
  "PASS: $($summary.pass_count)  FAIL: $($summary.fail_count)  TOTAL: $($summary.total)"
  ""
  "Checks:"
) | Out-File -FilePath $txtPath -Encoding utf8
foreach ($c in $Checks) {
  ("[{0}] {1} ({2}) | {3} | Evidence: {4}" -f ($(if($c.pass){'PASS'}else{'FAIL'})), $c.title, $c.control, $c.observed, $c.evidence_hint) |
    Add-Content -Path $txtPath -Encoding utf8
}

$jsonPath = Join-Path $outDir "validation-report-43-controls.json"
$enc = New-Object System.Text.UTF8Encoding($false)
$jsonText = ([pscustomobject]@{
  summary = $summary
  checks = $Checks
} | ConvertTo-Json -Depth 6)
[System.IO.File]::WriteAllText($jsonPath, $jsonText, $enc)

Write-Host "43-control validation: $($summary.pass_count)/$($summary.total) PASS. Wrote $txtPath and $jsonPath"
if ($summary.fail_count -gt 0) {
  Write-Host "FAIL: $($summary.fail_count) controls — ensure evidence bundle has required files and enclave-scope-na.json for design/NA controls."
}
