<#
Run-CuiHardeningAndValidate-Elevated.ps1

Runs hardening + evidence + validation as SYSTEM (highest privileges) to avoid UAC issues.
Designed to preserve SSH/RDP access while hardening everything else.

Outputs:
- A new CUI-Evidence-* directory under C:\evidence
- A new CUI-Validation-* directory under C:\evidence
#>

[CmdletBinding()]
param(
  [ValidateSet("pilot_strict","safe_minimum")]
  [string]$Mode = "pilot_strict",

  [bool]$KeepSshAccess = $true,
  [bool]$KeepRdpAccess = $true,

  # If true, deletes temporary task + files after run.
  [bool]$Cleanup = $true
)

$scriptsRoot = "C:\hardening\codex-scripts"
$invoke = Join-Path $scriptsRoot "Invoke-CuiHardening.ps1"
$collect = Join-Path $scriptsRoot "Collect-Cui-Evidence.ps1"
$test = Join-Path $scriptsRoot "Test-CuiHardening.ps1"

foreach ($p in @($invoke,$collect,$test)) {
  if (-not (Test-Path -LiteralPath $p)) { throw "Missing required script: $p" }
}

$runId = Get-Date -Format yyyyMMdd-HHmmss
$taskName = "CUI-HardeningOnce-$runId"
$evidenceDir = "C:\evidence\CUI-Evidence-$runId"
$validationDir = "C:\evidence\CUI-Validation-$runId"

$workDir = Join-Path $env:TEMP ("cui-run-{0}" -f $runId)
New-Item -ItemType Directory -Path $workDir -Force | Out-Null
$ps1Path = Join-Path $workDir "run.ps1"
$logPath = Join-Path $workDir "run.out.txt"

$ks = if ($KeepSshAccess) { '$true' } else { '$false' }
$kr = if ($KeepRdpAccess) { '$true' } else { '$false' }

$ps1Body = @"
`$ErrorActionPreference = 'Continue'
`$ProgressPreference = 'SilentlyContinue'

& '$invoke' -Mode '$Mode' -KeepSshAccess:$ks -KeepRdpAccess:$kr -EnableAppLocker:`$true -EnableBitLocker:`$true -SetLegalNotice:`$true
& '$collect' -OutRoot 'C:\evidence' -RunId '$runId'
& '$test' -OutRoot 'C:\evidence' -RunId '$runId' -EvidenceDir '$evidenceDir'
"@

Set-Content -LiteralPath $ps1Path -Value $ps1Body -Encoding UTF8
Write-Host "Wrote task script: $ps1Path"
Write-Host "Will write output log to: $logPath"

Write-Host "Creating scheduled task: $taskName"
$st = (Get-Date).AddMinutes(2).ToString("HH:mm")
$tr = "cmd.exe /c powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$ps1Path`" > `"$logPath`" 2>&1"
schtasks.exe /Create /TN "$taskName" /RU "SYSTEM" /RL HIGHEST /SC ONCE /ST $st /F /TR $tr | Out-Host

Write-Host "Running scheduled task..."
schtasks.exe /Run /TN "$taskName" | Out-Host

Write-Host "Waiting for completion..."
while ($true) {
  Start-Sleep -Seconds 5
  $q = (schtasks.exe /Query /TN "$taskName" /FO LIST /V) 2>&1 | Out-String
  if ($q -match '(?im)^\s*Status:\s*(.+)\s*$') {
    $status = $Matches[1].Trim()
    if ($status -match 'Ready|Could not start') { break }
  }
}

Write-Host "Task finished."
try {
  $q = (schtasks.exe /Query /TN "$taskName" /FO LIST /V) 2>&1 | Out-String
  ($q | Select-String -Pattern 'Status:|Last Run Time:|Last Result:' | ForEach-Object { $_.ToString() }) | Write-Host
} catch {}

if ($Cleanup) {
  Write-Host "Cleaning up task registration + temp files."
  try { schtasks.exe /Delete /TN "$taskName" /F | Out-Null } catch {}
  try { Remove-Item -LiteralPath $workDir -Recurse -Force -ErrorAction SilentlyContinue } catch {}
} else {
  Write-Host "Cleanup disabled. Temp files left at:"
  Write-Host ("  {0}" -f $workDir)
}

Write-Host "Done."
Write-Host ("Evidence:   {0}" -f $evidenceDir)
Write-Host ("Validation: {0}" -f $validationDir)
