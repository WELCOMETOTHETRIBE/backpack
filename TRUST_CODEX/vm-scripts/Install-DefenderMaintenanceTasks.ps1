<#
Install-DefenderMaintenanceTasks.ps1

Installs scheduled tasks that keep Windows Defender signatures current and provide evidence artifacts.
This is not strictly required if Windows Update is functioning, but it is auditor-friendly because it:
- Forces signature updates on cadence
- Runs periodic scans
- Writes a timestamped artifact under C:\evidence

Tasks created (Task Scheduler):
- Codex_Defender_SignatureUpdate (weekly, every 7 days)
- Codex_Defender_QuickScan (weekly)
- Codex_Defender_FullScan (monthly)

Each task calls: C:\Codex\TRUST_CODEX\vm-scripts\Run-DefenderMaintenance.ps1
#>

param(
  [Parameter(Mandatory = $false)]
  [string]$RepoRoot = "C:\Codex\TRUST_CODEX",

  [Parameter(Mandatory = $false)]
  [string]$OutRoot = "C:\evidence",

  [Parameter(Mandatory = $false)]
  [ValidateSet("MON","TUE","WED","THU","FRI","SAT","SUN")]
  [string]$SignatureUpdateDay = "SUN",

  [Parameter(Mandatory = $false)]
  [string]$SignatureUpdateTime = "03:10",

  [Parameter(Mandatory = $false)]
  [ValidateSet("MON","TUE","WED","THU","FRI","SAT","SUN")]
  [string]$WeeklyDay = "SUN",

  [Parameter(Mandatory = $false)]
  [string]$WeeklyTime = "03:30",

  [Parameter(Mandatory = $false)]
  [ValidateRange(1,28)]
  [int]$MonthlyDay = 1,

  [Parameter(Mandatory = $false)]
  [string]$MonthlyTime = "04:10"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Task-CreateOrReplace {
  param(
    [string]$Name,
    [string]$ScheduleArgs,
    [string]$Mode
  )
  $runner = Join-Path $RepoRoot "vm-scripts\Run-DefenderMaintenance.ps1"
  if (-not (Test-Path -LiteralPath $runner)) {
    throw "Runner script not found: $runner"
  }

  # Build an idempotent /Create (with /F) to replace existing tasks without spamming "not found" errors.
  $tr = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""$runner"" -Mode $Mode -OutRoot ""$OutRoot"""
  # When run by the Codex manual server (SYSTEM), force the task principal to SYSTEM to avoid
  # account mapping issues and to ensure it can execute Defender actions consistently.
  $create = "schtasks /Create /TN ""$Name"" /TR ""$tr"" $ScheduleArgs /RU ""SYSTEM"" /RL HIGHEST /F"
  Write-Host $create -ForegroundColor Cyan

  $out = cmd.exe /c $create 2>&1
  $code = $LASTEXITCODE
  if ($out) { $out | ForEach-Object { Write-Host $_ } }
  if ($code -ne 0) {
    throw "schtasks /Create failed for $Name (exit $code)"
  }
}

Write-Host "Installing Windows Defender maintenance tasks..." -ForegroundColor Cyan
Write-Host "RepoRoot: $RepoRoot"
Write-Host "OutRoot:  $OutRoot"

# Daily signature update
# Weekly signature update (every 7 days)
Task-CreateOrReplace -Name "Codex_Defender_SignatureUpdate" -ScheduleArgs "/SC WEEKLY /D $SignatureUpdateDay /ST $SignatureUpdateTime" -Mode "SignatureUpdate"

# Weekly quick scan
Task-CreateOrReplace -Name "Codex_Defender_QuickScan" -ScheduleArgs "/SC WEEKLY /D $WeeklyDay /ST $WeeklyTime" -Mode "QuickScan"

# Monthly full scan
Task-CreateOrReplace -Name "Codex_Defender_FullScan" -ScheduleArgs "/SC MONTHLY /D $MonthlyDay /ST $MonthlyTime" -Mode "FullScan"

Write-Host "Done. Verify in Task Scheduler or via: schtasks /Query /TN Codex_Defender_* /V /FO LIST" -ForegroundColor Green

