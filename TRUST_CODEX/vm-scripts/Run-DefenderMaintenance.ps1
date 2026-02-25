<#
Run-DefenderMaintenance.ps1

Purpose:
- Provide assessor-friendly, repeatable evidence for Windows Defender posture
- Optionally perform a signature update and/or scan
- Write a timestamped evidence artifact under C:\evidence

Modes:
- Status: snapshot only (no changes)
- SignatureUpdate: forces a signature update via MpCmdRun
- QuickScan: Start-MpScan -ScanType QuickScan
- FullScan: Start-MpScan -ScanType FullScan
#>

param(
  [Parameter(Mandatory = $false)]
  [ValidateSet("Status", "SignatureUpdate", "QuickScan", "FullScan")]
  [string]$Mode = "Status",

  [Parameter(Mandatory = $false)]
  [string]$OutRoot = "C:\evidence",

  [Parameter(Mandatory = $false)]
  [string]$RunId = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

function Get-StatusProp {
  param([object]$Obj, [string]$Name)
  try {
    if ($null -eq $Obj) { return $null }
    $p = $Obj.PSObject.Properties[$Name]
    if ($p) { return $p.Value }
    return $null
  } catch {
    return $null
  }
}

function New-RunId {
  try { return (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss") } catch { return "" }
}

function Write-Utf8NoBom {
  param([string]$Path, [string]$Text)
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $enc)
}

function Try-Exec {
  param([scriptblock]$Fn)
  # IMPORTANT: capture all output so callers get a single object back.
  # Otherwise, any pipeline output would get "mixed in" with the return value,
  # turning it into an array and breaking property access under StrictMode.
  $out = ""
  try {
    $out = (& $Fn 2>&1 | Out-String)
    return @{ ok = $true; error = $null; output = $out }
  } catch {
    try { $out = $out + "`n" + ($_.Exception.Message) } catch {}
    return @{ ok = $false; error = $_.Exception.Message; output = $out }
  }
}

if (-not $RunId) { $RunId = New-RunId }
if (-not $RunId) { $RunId = (Get-Date).ToUniversalTime().ToString("o").Replace(":","-").Replace(".","-") }

$outDir = Join-Path $OutRoot ("CUI-Defender-Maintenance-" + $RunId)
try { New-Item -ItemType Directory -Force -Path $outDir | Out-Null } catch {}

$startedUtc = (Get-Date).ToUniversalTime().ToString("o")

$action = @{ mode = $Mode; started_utc = $startedUtc; steps = @() }

if ($Mode -eq "SignatureUpdate") {
  $mp = Join-Path $env:ProgramFiles "Windows Defender\MpCmdRun.exe"
  $action.steps += @{ step = "signature_update"; command = $mp + " -SignatureUpdate" }
  if (Test-Path -LiteralPath $mp) {
    $r = Try-Exec { & $mp -SignatureUpdate }
    $action.steps += @{ step = "signature_update_result"; ok = $r.ok; error = $r.error; output = $r.output }
  } else {
    $action.steps += @{ step = "signature_update_result"; ok = $false; error = "MpCmdRun.exe not found at: $mp" }
  }
}

if ($Mode -eq "QuickScan") {
  $action.steps += @{ step = "quick_scan"; command = "Start-MpScan -ScanType QuickScan" }
  $r = Try-Exec { Start-MpScan -ScanType QuickScan -ErrorAction Stop }
  $action.steps += @{ step = "quick_scan_result"; ok = $r.ok; error = $r.error; output = $r.output }
}

if ($Mode -eq "FullScan") {
  $action.steps += @{ step = "full_scan"; command = "Start-MpScan -ScanType FullScan" }
  $r = Try-Exec { Start-MpScan -ScanType FullScan -ErrorAction Stop }
  $action.steps += @{ step = "full_scan_result"; ok = $r.ok; error = $r.error; output = $r.output }
}

# Snapshot Defender posture (post-action).
$status = $null
try { $status = Get-MpComputerStatus -ErrorAction Stop } catch { $status = $null }
$sigLastUtc = ""
try {
  if ($status -and $status.AntivirusSignatureLastUpdated) { $sigLastUtc = $status.AntivirusSignatureLastUpdated.ToUniversalTime().ToString("o") }
} catch {}

$threatDetections = @()
$threatSummary = @{
  total = 0
  high = 0
  severe = 0
  medium = 0
  low = 0
}
try {
  $td = Get-MpThreatDetection -ErrorAction SilentlyContinue
  if ($td) {
    $threatDetections = @($td | Select-Object -First 50 ThreatName,SeverityID,ActionSuccess,InitialDetectionTime,LastThreatStatusChangeTime,Resources)
    $threatSummary.total = @($td).Count
    foreach ($x in @($td)) {
      try {
        $sev = [int]$x.SeverityID
        if ($sev -ge 4) { $threatSummary.severe += 1 }
        elseif ($sev -eq 3) { $threatSummary.high += 1 }
        elseif ($sev -eq 2) { $threatSummary.medium += 1 }
        elseif ($sev -eq 1) { $threatSummary.low += 1 }
      } catch {}
    }
  }
} catch {}

$endedUtc = (Get-Date).ToUniversalTime().ToString("o")
$durationSeconds = 0
try {
  $durationSeconds = [int]([DateTime]::Parse($endedUtc).Subtract([DateTime]::Parse($startedUtc)).TotalSeconds)
} catch { $durationSeconds = 0 }

try {
  $action.ended_utc = $endedUtc
  $action.duration_seconds = $durationSeconds
} catch {}

$artifact = [pscustomobject]@{
  schema = "mactech.codex.defender.maintenance"
  version = 1
  run_id = $RunId
  generated_utc = $endedUtc
  mode = $Mode
  action = $action
  status = if ($status) {
    @{
      AMServiceEnabled = (Get-StatusProp -Obj $status -Name "AMServiceEnabled")
      AntivirusEnabled = (Get-StatusProp -Obj $status -Name "AntivirusEnabled")
      AntispywareEnabled = (Get-StatusProp -Obj $status -Name "AntispywareEnabled")
      RealTimeProtectionEnabled = (Get-StatusProp -Obj $status -Name "RealTimeProtectionEnabled")
      NISEnabled = (Get-StatusProp -Obj $status -Name "NISEnabled")
      AntivirusSignatureVersion = (Get-StatusProp -Obj $status -Name "AntivirusSignatureVersion")
      AntivirusSignatureLastUpdatedUtc = $sigLastUtc
      AntivirusSignatureAgeDays = (Get-StatusProp -Obj $status -Name "AntivirusSignatureAge")
      EngineVersion = (Get-StatusProp -Obj $status -Name "EngineVersion")
      AMProductVersion = (Get-StatusProp -Obj $status -Name "AMProductVersion")
      FullScanAgeDays = (Get-StatusProp -Obj $status -Name "FullScanAge")
      QuickScanAgeDays = (Get-StatusProp -Obj $status -Name "QuickScanAge")
    }
  } else {
    @{ error = "Get-MpComputerStatus failed" }
  }
  threat_detection = @{
    summary = $threatSummary
    samples = $threatDetections
  }
  out_dir = $outDir
}

$jsonPath = Join-Path $outDir "defender-maintenance.json"
$mdPath = Join-Path $outDir "defender-maintenance.md"

$json = ($artifact | ConvertTo-Json -Depth 6) + "`n"
Write-Utf8NoBom -Path $jsonPath -Text $json

$md = @()
$md += "# Windows Defender maintenance snapshot"
$md += ""
$md += "Generated (UTC): $endedUtc"
$md += ""
$md += "Mode: **$Mode**"
$md += ""
$md += "## Status"
if ($status) {
  $md += "- Real-time protection: **$($status.RealTimeProtectionEnabled)**"
  $md += "- Antivirus enabled: **$($status.AntivirusEnabled)**"
  # Avoid PowerShell string-escape pitfalls with markdown backticks.
  $md += ('- Signature version: `' + [string]$status.AntivirusSignatureVersion + '`')
  $md += "- Signature age (days): **$($status.AntivirusSignatureAge)**"
  if ($status.AntivirusSignatureLastUpdated) {
    $md += ('- Signature last updated (UTC): `' + [string]$status.AntivirusSignatureLastUpdated.ToUniversalTime().ToString('o') + '`')
  }
  $md += "- Quick scan age (days): **$($status.QuickScanAge)**"
  $md += "- Full scan age (days): **$($status.FullScanAge)**"
} else {
  $md += "- (Status unavailable) Get-MpComputerStatus failed."
}
$md += ""
$md += "## Threat detections (summary)"
try {
  $md += "- Total detections: **$($threatSummary.total)**"
  $md += "- Severe: **$($threatSummary.severe)** · High: **$($threatSummary.high)** · Medium: **$($threatSummary.medium)** · Low: **$($threatSummary.low)**"
} catch {}
$md += ""
$md += "## Stored artifacts"
$md += ('- JSON: `' + [string]$jsonPath + '`')
$md += ('- Markdown: `' + [string]$mdPath + '`')
$md += ""

Write-Utf8NoBom -Path $mdPath -Text (($md -join "`n") + "`n")

Write-Host ("Wrote: " + $jsonPath) -ForegroundColor Green
Write-Host ("Wrote: " + $mdPath) -ForegroundColor Green

