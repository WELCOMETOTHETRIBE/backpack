<#
Invoke-DefenderMaintenanceAsync.ps1

Runs Run-DefenderMaintenance.ps1 in a way that is friendly to the Codex Manual HTTP server:
- Writes a run-status.json immediately (so UI can show "in progress")
- Writes run.log (combined stdout/stderr)
- Writes run-finished.json when complete (exit code + timestamps)

This script is intended to be launched via Start-Process (background).
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

function New-RunId {
  try { return (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss") } catch { return "" }
}

function Write-Utf8NoBom {
  param([string]$Path, [string]$Text)
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $enc)
}

if (-not $RunId) { $RunId = New-RunId }
if (-not $RunId) { $RunId = (Get-Date).ToUniversalTime().ToString("o").Replace(":","-").Replace(".","-") }

$outDir = Join-Path $OutRoot ("CUI-Defender-Maintenance-" + $RunId)
try { New-Item -ItemType Directory -Force -Path $outDir | Out-Null } catch {}

$statusPath = Join-Path $outDir "run-status.json"
$logPath = Join-Path $outDir "run.log"
$finishedPath = Join-Path $outDir "run-finished.json"

$startedUtc = (Get-Date).ToUniversalTime().ToString("o")

try {
  $st = @{
    schema = "mactech.codex.defender.run_status"
    version = 1
    run_id = $RunId
    mode = $Mode
    started_utc = $startedUtc
    pid = $PID
    state = "running"
  }
  Write-Utf8NoBom -Path $statusPath -Text (($st | ConvertTo-Json -Depth 6) + "`n")
} catch {}

$exitCode = 0
$err = $null
try {
  $runner = "C:\Codex\TRUST_CODEX\vm-scripts\Run-DefenderMaintenance.ps1"
  if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) {
    throw "Runner script not found: $runner"
  }
  # Capture all output to a single log file so the UI can show it if needed.
  $out = (& $runner -Mode $Mode -OutRoot $OutRoot -RunId $RunId 2>&1 | Out-String)
  try { Write-Utf8NoBom -Path $logPath -Text ($out + "`n") } catch {}
} catch {
  $exitCode = 1
  $err = $_.Exception.Message
  try {
    Write-Utf8NoBom -Path $logPath -Text ("ERROR: " + $err + "`n")
  } catch {}
}

$endedUtc = (Get-Date).ToUniversalTime().ToString("o")
$durationSeconds = 0
try {
  $durationSeconds = [int]([DateTime]::Parse($endedUtc).Subtract([DateTime]::Parse($startedUtc)).TotalSeconds)
} catch { $durationSeconds = 0 }

try {
  $fin = @{
    schema = "mactech.codex.defender.run_finished"
    version = 1
    run_id = $RunId
    mode = $Mode
    started_utc = $startedUtc
    finished_utc = $endedUtc
    duration_seconds = $durationSeconds
    exitCode = $exitCode
    ok = ($exitCode -eq 0)
    error = $err
    out_dir = $outDir
  }
  Write-Utf8NoBom -Path $finishedPath -Text (($fin | ConvertTo-Json -Depth 6) + "`n")
} catch {}

try {
  $state = "failed"
  if ($exitCode -eq 0) { $state = "ok" }
  $st2 = @{
    schema = "mactech.codex.defender.run_status"
    version = 1
    run_id = $RunId
    mode = $Mode
    started_utc = $startedUtc
    finished_utc = $endedUtc
    duration_seconds = $durationSeconds
    pid = $PID
    state = $state
  }
  Write-Utf8NoBom -Path $statusPath -Text (($st2 | ConvertTo-Json -Depth 6) + "`n")
} catch {}

exit $exitCode

